# Cache search results at the edge (#42)

A fictional pull request, used as the source for the `tour` example.

## Why

Search is the slowest page in the app. The p95 response time is 1,840 ms, and
search makes up 38% of all API traffic.

## What changes

- `search/handler.ts` checks the edge cache before querying the database.
- Results are cached for 60 seconds per query and locale.
- A new "Updated just now" hint on the results page shows when results are fresh.
- Writes to an item purge the cached queries that contain it.

## Results (staging, one week)

| Day | p95 before (ms) | p95 after (ms) |
| --- | --- | --- |
| Mon | 1840 | 420 |
| Tue | 1790 | 380 |
| Wed | 1900 | 310 |
| Thu | 1860 | 290 |
| Fri | 1820 | 300 |

- Cache hit rate: 71%
- Database load: down 46%

## Checks

- Unit tests: 214 passed
- Load test at 2x peak: passed
- Stale results after a write: none found in 10,000 writes

## Decisions

- TTL is 60 seconds, not 5 minutes: product wants prices to be current.
- Cache key includes the locale, because results are translated.

## Follow-ups

- Warm the cache for the 100 most common queries after a deploy.
- Add a cache dashboard.
