#!/bin/bash
# run_benchmarks.sh
# Runs memtier_benchmark against the Redis and Memcached containers at
# pipeline depths 1, 10, and 50, using a 9:1 read/write ratio and a
# Usage (from Git Bash / WSL / Linux / macOS):
#   ./scripts/run_benchmarks.sh

set -e

NETWORK="benchmark-net"
RESULTS_DIR="results"
PIPELINES=(1 10 50)

mkdir -p "$RESULTS_DIR"

run_redis_benchmark() {
  local pipeline=$1
  echo "=== Redis benchmark - pipeline depth $pipeline ===" >> "$RESULTS_DIR/redis_bench.txt"
  docker run --rm --network "$NETWORK" redislabs/memtier_benchmark \
    --server=redis --port=6379 \
    --protocol=redis \
    --pipeline="$pipeline" \
    --ratio=1:9 \
    --key-pattern=G:G \
    --key-minimum=1 --key-maximum=100000 \
    --clients=10 --threads=4 --requests=10000 \
    >> "$RESULTS_DIR/redis_bench.txt" 2>&1
  echo "" >> "$RESULTS_DIR/redis_bench.txt"
}

run_memcached_benchmark() {
  local pipeline=$1
  echo "=== Memcached benchmark - pipeline depth $pipeline ===" >> "$RESULTS_DIR/memcached_bench.txt"
  docker run --rm --network "$NETWORK" redislabs/memtier_benchmark \
    --server=memcached --port=11211 \
    --protocol=memcache_text \
    --pipeline="$pipeline" \
    --ratio=1:9 \
    --key-pattern=G:G \
    --key-minimum=1 --key-maximum=100000 \
    --clients=10 --threads=4 --requests=10000 \
    >> "$RESULTS_DIR/memcached_bench.txt" 2>&1
  echo "" >> "$RESULTS_DIR/memcached_bench.txt"
}

echo "Starting benchmark suite (pipelines: ${PIPELINES[*]})..."

for p in "${PIPELINES[@]}"; do
  echo "Running Redis benchmark at pipeline depth $p..."
  run_redis_benchmark "$p"

  echo "Running Memcached benchmark at pipeline depth $p..."
  run_memcached_benchmark "$p"
done

echo "Benchmarks complete. Results saved in $RESULTS_DIR/"
echo "Open $RESULTS_DIR/redis_bench.txt and $RESULTS_DIR/memcached_bench.txt to see Ops/sec and latency for each pipeline depth."
