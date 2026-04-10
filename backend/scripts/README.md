# backend/scripts

Utility and maintenance scripts. Not loaded by the Express server.

| File | Purpose |
|------|---------|
| `benchmark.js` | Measures upload/download throughput against a local instance |
| `check_user.js` | Looks up a Supabase user by email; useful for debugging auth issues |
| `test-hdfs-log.js` | Fires a test event through `hdfsLogger` to verify HDFS connectivity |
| `process_logs.py` | One-off log parser for local HDFS log files |
| `spark-jobs/` | Spark (and fallback Python) analytics jobs — run via `bigdata/run_analytics.sh` |

Run any Node script with:

```bash
node backend/scripts/<script>.js
```
