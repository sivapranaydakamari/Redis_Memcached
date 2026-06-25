// scripts/consistencyTest.js
// Stress-tests the leaderboard increment logic to PROVE the race
// condition described in the assignment:
//   - Redis (ZINCRBY)                        -> always ends at exactly 1000
//   - Memcached, no lock (read+modify+write)  -> ends BELOW 1000 (lost updates)
//   - Memcached, with add()-based lock        -> always ends at exactly 1000
//
// Run with (after `docker-compose up -d`, from your host machine):
//   REDIS_URL=redis://localhost:6379 MEMCACHED_URL=localhost:11211 node scripts/consistencyTest.js

require('dotenv').config();

const { redisClient, connectRedis } = require('../src/redisClient');
const memcachedClient = require('../src/memcachedClient');
const { mcDel } = require('../src/memcachedHelpers');
const leaderboardService = require('../src/services/leaderboardService');
const fs = require('fs');
const path = require('path');

const CONCURRENT_CLIENTS = 10;
const INCREMENTS_PER_CLIENT = 100;
const EXPECTED_TOTAL = CONCURRENT_CLIENTS * INCREMENTS_PER_CLIENT; // 1000

const REDIS_TEST_ID = 'consistency-test-redis';
const MEMCACHED_NO_LOCK_ID = 'consistency-test-no-lock';
const MEMCACHED_WITH_LOCK_ID = 'consistency-test-with-lock';

const SUBMISSION_JSON_PATH = path.join(__dirname, '..', 'submission.json');

// Runs `incrementFn` INCREMENTS_PER_CLIENT times, in CONCURRENT_CLIENTS
// parallel "clients" - that's what the assignment means by "10
// concurrent clients incrementing the same ID 100 times".
async function runConcurrentIncrements(incrementFn, productId) {
  const clientLoop = async () => {
    for (let i = 0; i < INCREMENTS_PER_CLIENT; i++) {
      await incrementFn(productId);
    }
  };

  const clients = Array.from({ length: CONCURRENT_CLIENTS }, clientLoop);
  await Promise.all(clients);
}

async function testRedis() {
  await redisClient.zRem('leaderboard', REDIS_TEST_ID); // start from a clean score
  await runConcurrentIncrements(leaderboardService.incrementViewRedis, REDIS_TEST_ID);
  const score = await redisClient.zScore('leaderboard', REDIS_TEST_ID);
  return Number(score);
}

async function testMemcachedNoLock() {
  await mcDel(memcachedClient, 'leaderboard'); // clean slate (shared key)
  await runConcurrentIncrements(leaderboardService.incrementViewMemcachedNoLock, MEMCACHED_NO_LOCK_ID);
  const top = await leaderboardService.getTopProductsMemcached(1000);
  const entry = top.find((row) => row.productId === MEMCACHED_NO_LOCK_ID);
  return entry ? entry.views : 0;
}

async function testMemcachedWithLock() {
  await mcDel(memcachedClient, 'leaderboard'); // clean slate (shared key)
  await runConcurrentIncrements(leaderboardService.incrementViewMemcached, MEMCACHED_WITH_LOCK_ID);
  const top = await leaderboardService.getTopProductsMemcached(1000);
  const entry = top.find((row) => row.productId === MEMCACHED_WITH_LOCK_ID);
  return entry ? entry.views : 0;
}

// Updates only the "consistency" block of submission.json, leaving the
// "benchmarks" block (filled in manually from run_benchmarks.sh output)
// untouched.
function updateSubmissionJson(consistency) {
  const submission = JSON.parse(fs.readFileSync(SUBMISSION_JSON_PATH, 'utf8'));
  submission.consistency = consistency;
  fs.writeFileSync(SUBMISSION_JSON_PATH, JSON.stringify(submission, null, 2) + '\n');
}

async function main() {
  await connectRedis();

  console.log(
    `Running consistency test: ${CONCURRENT_CLIENTS} clients x ${INCREMENTS_PER_CLIENT} increments (expected total = ${EXPECTED_TOTAL})\n`
  );

  const redisScore = await testRedis();
  console.log(`Redis (ZINCRBY) final score:             ${redisScore} / ${EXPECTED_TOTAL}`);

  const noLockScore = await testMemcachedNoLock();
  console.log(`Memcached, no lock final count:          ${noLockScore} / ${EXPECTED_TOTAL}`);

  const withLockScore = await testMemcachedWithLock();
  console.log(`Memcached, with add() lock final count:  ${withLockScore} / ${EXPECTED_TOTAL}`);

  const consistency = {
    memcached_lost_increments_no_lock: EXPECTED_TOTAL - noLockScore,
    memcached_lost_increments_with_lock: EXPECTED_TOTAL - withLockScore,
  };

  updateSubmissionJson(consistency);
  console.log('\nUpdated submission.json "consistency" block:');
  console.log(JSON.stringify(consistency, null, 2));

  await redisClient.quit();
  memcachedClient.end();
}

main().catch((err) => {
  console.error('Consistency test failed:', err);
  process.exit(1);
});
