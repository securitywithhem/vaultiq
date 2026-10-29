# backend/scripts

Utility and maintenance scripts. Not loaded by the Express server.

| File | Purpose |
|------|---------|
| `migrate.js` | Runs DB migrations through the Supabase REST API (reads credentials from `.env`) |
| `migrate_pg.js` | Runs DB migrations over a direct PostgreSQL connection |

Analytics jobs live in `bigdata/` and run via `bigdata/run_analytics.sh`.

Run any Node script with:

```bash
node backend/scripts/<script>.js
```
