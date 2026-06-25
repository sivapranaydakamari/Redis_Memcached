# Redis vs Memcached Benchmark Lab

A Product Catalog API that implements the same caching patterns twice -
once with Redis 7, once with Memcached 1.6 - so the two can be compared
side by side: caching, leaderboards, rate limiting, sessions, and
invalidation.

The API never picks a backend for you. Every request says which cache
to use via the `X-Cache-Backend` header (`redis` or `memcached`), so
you can hit the exact same endpoint twice and compare behavior.

## Architecture

```
                       +-------------------------+
   Locust / memtier --> |   Product Catalog API   |
                       |   (Express, Node.js)    |
                       +-----+--------+-----------+
                             |        |
                 X-Cache-Backend      |  Cache miss / writes
                   redis    memcached |
                     |        |       v
                     v        v   +--------+
              +--------+ +----------+ | Postgres |
              | Redis 7| |Memcached | | (100,000 |
              | (ZSET, | | 1.6      | | products)|
              |  Hash) | |(strings) | +----------+
              +--------+ +----------+
```

- **app**: the Express API (this repo's `src/`)
- **redis**: Redis 7 - ZSET leaderboard, Hash sessions, MULTI/EXEC rate
  limiter, PUBLISH-based invalidation
- **memcached**: Memcached 1.6 - JSON-string leaderboard guarded by an
  `add()`-based lock, JSON-string sessions, `incr`-based rate limiter,
  version-key cache invalidation
- **db**: Postgres, seeded with 100,000 products on first boot

## Setup

1. Copy the env file (defaults already match `docker-compose.yml`):
   ```
   cp .env.example .env
   ```
2. Build and start everything:
   ```
   docker-compose up -d --build
   ```
3. Wait for all four services to report `healthy`:
   ```
   docker-compose ps
   ```
   The `db` service won't go healthy until all 100,000 product rows
   exist (see the healthcheck in `docker-compose.yml`), and `app` won't
   start until `db`, `redis`, and `memcached` are all healthy.
4. Verify the seed:
   ```
   docker-compose exec db psql -U postgres -d products_db -c "SELECT count(*) FROM products;"
   ```


## API Examples

All examples use `curl`. On Windows PowerShell, `curl` is aliased to
`Invoke-WebRequest` - use `curl.exe` explicitly, or run these from Git
Bash/WSL instead.

**Get a product (cache-aside read), then check it landed in cache:**
```bash
curl -H "X-Cache-Backend: redis" http://localhost:3000/products/1
docker-compose exec redis redis-cli keys "product:*"

curl -H "X-Cache-Backend: memcached" http://localhost:3000/products/1
echo "stats items" | docker-compose exec -T memcached nc localhost 11211
```

**Update a product (invalidates the cache):**
```bash
curl -X POST -H "Content-Type: application/json" -H "X-Cache-Backend: redis" \
  -d '{"price": 19.99}' http://localhost:3000/products/1
```

**Leaderboard - record a view, then read the top 10:**
```bash
curl -X POST -H "X-Cache-Backend: redis" http://localhost:3000/products/1/view
curl -H "X-Cache-Backend: redis" http://localhost:3000/leaderboard
```

**Rate limiter - hammer the same user ID and watch it trip at 100:**
```bash
for i in $(seq 1 105); do
  curl -s -o /dev/null -w "%{http_code}\n" -H "X-Cache-Backend: redis" \
    http://localhost:3000/rate-limit-test/user-42
done
```

**Sessions - create one, then update a single field:**
```bash
curl -X POST -H "Content-Type: application/json" -H "X-Cache-Backend: redis" \
  -d '{"userId": "42", "last_login": "2026-01-01"}' http://localhost:3000/session/abc

curl -X PATCH -H "Content-Type: application/json" -H "X-Cache-Backend: redis" \
  -d '{"value": "2026-06-22"}' http://localhost:3000/session/abc/last_login

docker-compose exec redis redis-cli HGET session:abc last_login
```

## Benchmarking

```bash
./scripts/run_benchmarks.sh
```

This runs `memtier_benchmark` (via Docker, no local install needed)
against both `redis` and `memcached` at pipeline depths 1, 10, and 50,
using a 9:1 read/write ratio and a Gaussian key distribution. Results
are appended to `results/redis_bench.txt` and `results/memcached_bench.txt`.

Open those files, find the `Totals` row under each `pipeline depth 1`
section, and copy the `Ops/sec` and `p99 Latency` values into
`submission.json` under `benchmarks`.

## Consistency Test

Run this on your host machine (not inside Docker) once the stack is up
and `.env` exists (`cp .env.example .env` - its defaults already point
at the ports docker-compose publishes to localhost):
```bash
node scripts/consistencyTest.js
```

Runs 10 concurrent "clients" each incrementing the same leaderboard
entry 100 times (1000 increments total) three ways: Redis `ZINCRBY`,
Memcached with no lock, and Memcached with the `add()`-based lock from
`src/services/memcachedLock.js`. It prints the final counts and writes
the lost-increment counts into `submission.json` under `consistency`.

Expected result: Redis = 1000, Memcached/no-lock < 1000 (lost
updates), Memcached/with-lock = 1000.

## Memory Comparison

Storing 100,000 product objects costs more in Redis than Memcached per
key, because Redis's value types carry extra metadata (encoding info,
TTL, refcounts) that a plain Memcached slab doesn't.

Measured by caching all 100,000 products (~155-165 byte JSON payload
each - the seeded descriptions are shorter than the assignment's
illustrative "~2KB" figure) on both backends, then reading:
- Redis: `docker-compose exec redis redis-cli info memory` (`used_memory`) and `redis-cli dbsize`
- Memcached: `echo "stats" | docker-compose exec -T memcached nc localhost 11211` (`bytes`, `curr_items`)
- Overhead per key = `(used_memory / key_count) - average_payload_bytes` (~160 bytes here)

| Storage Backend | Reported Used Memory (MB) | Overhead per Key (Bytes) |
| ---------------- | -------------------------- | ------------------------- |
| Redis 7           | 29.39 MB (30,818,568 bytes / 100,991 keys) | ~145 bytes/key |
| Memcached 1.6      | 22.67 MB (23,774,462 bytes / 100,991 keys) | ~75 bytes/key |

Redis spends roughly twice the per-key overhead Memcached does here -
consistent with Redis's richer value representation (each key carries
encoding metadata and a TTL) versus Memcached's flatter slab-allocated
storage.

## Project Structure

```
src/
  server.js              entry point
  db.js                  Postgres pool
  redisClient.js          Redis connection
  memcachedClient.js       Memcached connection
  memcachedHelpers.js      Promise wrappers around the raw memcached commands
  middleware/backendSelector.js   reads X-Cache-Backend
  routes/                 Express route handlers
  services/                business logic per cache backend
scripts/
  run_benchmarks.sh        memtier_benchmark runner
  consistencyTest.js        race-condition / lock proof
sql/init.sql               table + 100,000-row seed
docker-compose.yml
```
