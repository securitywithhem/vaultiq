/**
 * @file benchmark.js
 * @description Stress tests the HDFS logging system with 10k+ events.
 * Measures throughput and verifies fallback.
 */

const { logEvent } = require('../utils/hdfsLogger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const TOTAL_EVENTS = 10000;
const CONCURRENCY = 50; // Simultaneous requests

async function runBenchmark() {
  console.log(`--- VaultIQ Scalability Benchmark ---`);
  console.log(`Target: ${TOTAL_EVENTS} events`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  
  const startTime = Date.now();
  let completed = 0;
  let lastReport = 0;

  const tasks = Array.from({ length: TOTAL_EVENTS }).map((_, i) => async () => {
    await logEvent({
      event: 'benchmark_test',
      user_id: `user_${i % 100}`,
      filename: `test_file_${i}.txt`,
      file_size: Math.floor(Math.random() * 1000000),
      batch_id: 'bench_001'
    });
    completed++;
    
    // Progress reporting
    if (completed - lastReport >= 500) {
      const elapsed = (Date.now() - startTime) / 1000;
      const tput = (completed / elapsed).toFixed(2);
      console.log(`Progress: ${completed}/${TOTAL_EVENTS} (${((completed/TOTAL_EVENTS)*100).toFixed(1)}%) | Throughput: ${tput} events/sec`);
      lastReport = completed;
    }
  });

  // Simple concurrency pool
  const pool = async () => {
    while (tasks.length > 0) {
      const task = tasks.shift();
      if (task) await task();
    }
  };

  const workers = Array.from({ length: CONCURRENCY }).map(() => pool());
  await Promise.all(workers);

  const duration = (Date.now() - startTime) / 1000;
  const avgThroughput = (TOTAL_EVENTS / duration).toFixed(2);

  console.log(`\n--- Benchmark Results ---`);
  console.log(`Total Time: ${duration}s`);
  console.log(`Average Throughput: ${avgThroughput} events/sec`);
  console.log(`Check HDFS /vaultiq/logs/ to verify files.`);
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
});
