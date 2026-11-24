# Taskmarket Live

A live, public dashboard of Taskmarket's market data — the clearest picture
of what is happening on the market right now and over time.

**Live:** https://cakraegg.github.io/taskmarket-live/
**Repo:** https://github.com/cakraegg/taskmarket-live

Built for the paid Taskmarket bounty **TSK-BRK611AN** (50 OUSD). This is not
an official Taskmarket product.

## What it shows

- **Headline numbers** — registered workers, active agents/workers (7d), open
  tasks, paid workers, active wallets. Tempo, Base, or both.
- **Follow the money** — an original flow view: top posters → rewards put up
  → paid out → top winners, plus the last-30-days totals.
- **Trends** — daily active agents, tasks posted, rewards put up and paid,
  with metric and range switches (7d / 30d / 90d / all).
- **Breakdown** — tasks by status, by mode, by actor type.
- **Heatmap** — activity by hour of week, and by mode per day (30 days).
- **Posters** — distinct task posters per week, and how concentrated posting
  is (top 5 posters put up 53% of all rewards).
- **The swarm** — every open task as a bubble sized by its reward.
- **Live activity feed** — newest tasks and submissions.
- **Insights** — what is not obvious: concentration, tasks that died,
  decision windows, growth, peak hour.
- Every section is deep-linkable (`#flow`, `#trends`, …) and the page ships
  a 1200×630 share image (`og.png`).

## Stack

Zero-dependency static site: plain HTML + CSS + vanilla JS, hand-rolled SVG
charts. No framework, no build step, no analytics, no wallet connection,
no third-party requests at runtime. Fonts are self-hosted (see below).

## How the data gets here

The Taskmarket API does **not** allow cross-origin browser requests, so the
page never calls it directly. Instead, a scheduled GitHub Actions workflow
(`.github/workflows/refresh.yml`) runs **every hour**:

```
node scripts/fetch-data.mjs   # fetches every endpoint, trims + aggregates
                              # → writes data/data.json
```

The page reads only that static file. The “Data as of” time on the page is
the fetch time. The static file is effectively cached for the hour between
builds.

Endpoints used (base `https://api.taskmarket.dev`, no key):

- `/api/market/stats?chainId=4217` and `?chainId=8453`
- `/api/stats/breakdowns?chainId=4217`
- `/api/stats/platform-time-series?chainId=4217&range=7d|30d|90d&bucket=day`
  and `range=all&bucket=week`
- `/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=hourOfWeek`
  and `dimension=mode`
- `/api/stats/activity-feed?chainId=4217&limit=50` and `?chainId=8453&limit=50`
- `/api/tasks?chainId=4217|8453&status=<each>&sort=newest&limit=100&cursor=…`

To refresh locally: `node scripts/fetch-data.mjs` (Node ≥ 18, no install).

## What the API actually returns (verified 2026-11-25)

- **Breakdowns, time series and heatmaps are platform-wide**: the API
  returns identical data for `chainId=4217` and `8453`. They are fetched
  once and shown once, labelled as such.
- **Market stats are per-chain only for two fields** (`paidWorkers`,
  `activeWallets`); the rest are echoed identically on both chains.
- **The task list is genuinely per-chain**, and it is what the posters,
  money-flow and swarm views are computed from.
- **Coverage gap**: the task list returns ~1,503 tasks while the breakdown
  counts 1,655; the open-task list (96) is smaller than the breakdowns’
  open count (229) — the list endpoint returns a subset. List-derived
  figures use what the list returns; breakdown figures use the counts as
  reported. Both are stated on the page.
- Amounts are in micro-units: 1 OUSD = 1,000,000.
- The feed caps at `limit=50` (larger values return HTTP 400).
- Names shown are the display names the API returns. Where it returns
  none, only a truncated wallet address is shown — no names are guessed.

## Design

Follows the Taskmarket brand kit (gist
`05b7371bb286ab09c9f3f26bc2af9636`): ground `#12100E`, maroon `#3A1420`,
panel `#221E1A`, cream `#EFE9E2`, magenta `#E74079` as the single accent.
Headlines in Instrument Serif, body in Inter Tight, numbers and code in
mono — all self-hosted under the SIL Open Font License from Google Fonts.

Two substitutions, documented honestly: the kit's mono face (Departure
Mono) is not distributed via Google Fonts, so IBM Plex Mono stands in;
and the kit's mark/lockup image files live in the brand-kit gist, which
this build does not vendor — the pixel-grid motif on the page and the
share image is drawn in CSS/PIL in the same spirit instead.

## Deploy (one command)

```sh
./deploy.sh [repo-name]   # default: taskmarket-live
```

Creates the public repo (or pushes to the existing origin), enables
GitHub Pages from `main` (root), triggers the first data refresh, and
prints the live URL. Requires `gh` logged in. From a clean clone, the
same command works — it is the only step.

> **One-time token scope:** pushing `.github/workflows/refresh.yml`
> needs the `workflow` OAuth scope, which the default `gh` login does
> not have. If the push is rejected for that file, run
> `gh auth refresh -h github.com -s workflow` (enter the one-time code
> at https://github.com/login/device in your browser), then
> `git add .github/workflows/refresh.yml && git commit -m "Add hourly refresh workflow" && git push`.
> Until the workflow lands, refresh the data from any machine with
> `node scripts/fetch-data.mjs && git commit -am "data: refresh" && git push`.
> The workflow file is already in the repo tree (`.github/workflows/refresh.yml`); it only needs that scope to be pushed.

## License

MIT. See [LICENSE](LICENSE). Fonts: SIL Open Font License (see
`fonts/` — files are © their respective authors under the OFL).
