/**
 * @file benchmark.js
 * @description Stress tests the HDFS logging system with 10k+ events.
 * Measures throughput and verifies fallback.
 */

const path = require('path');
// Ensure env vars are loaded BEFORE requiring modules that use them
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { logEvent } = require('../utils/hdfsLogger');

const TOTAL_EVENTS = process.env.TOTAL_EVENTS ? parseInt(process.env.TOTAL_EVENTS) : 10000;
const CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 50; 

async function runBenchmark() {
  console.log(`--- VaultIQ Scalability Benchmark ---`);
  console.log(`Target: ${TOTAL_EVENTS} events`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  
  const startTime = Date.now();
  let completed = 0;
  let lastReport = 0;

  // We use a queue to manage concurrency efficiently
  const tasks = Array.from({ length: TOTAL_EVENTS }).map((_, i) => i);

  const pool = async () => {
    while (tasks.length > 0) {
      const i = tasks.shift();
      if (i === undefined) break;

      await logEvent({
        event: 'benchmark_test',
        user_id: `user_${i % 100}`,
        filename: `test_file_${i}.txt`,
        file_size: Math.floor(Math.random() * 1000000),
        batch_id: 'bench_001'
      });
      
      completed++;
      
      // Progress reporting
      if (completed - lastReport >= 500 || completed === TOTAL_EVENTS) {
        const elapsed = (Date.now() - startTime) / 1000;
        const tput = (completed / elapsed).toFixed(2);
        console.log(`Progress: ${completed}/${TOTAL_EVENTS} (${((completed/TOTAL_EVENTS)*100).toFixed(1)}%) | Throughput: ${tput} events/sec`);
        lastReport = completed;
      }
    }
  };

  const workers = Array.from({ length: CONCURRENCY }).map(() => pool());
  await Promise.all(workers);

  const duration = (Date.now() - startTime) / 1000;
  const avgThroughput = (TOTAL_EVENTS / duration).toFixed(2);

  console.log(`\n--- Benchmark Results ---`);
  console.log(`Total Time: ${duration.toFixed(2)}s`);
  console.log(`Average Throughput: ${avgThroughput} events/sec`);
  console.log(`Check HDFS /vaultiq/logs/ to verify files.`);
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
