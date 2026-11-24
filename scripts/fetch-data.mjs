#!/usr/bin/env node
/**
 * Taskmarket Live — server-side data fetch.
 *
 * Runs in GitHub Actions every hour (and on demand). Fetches every public
 * Taskmarket API endpoint the dashboard needs, trims + aggregates the raw
 * responses into one small static file (data/data.json) that the page reads.
 * No browser ever talks to api.taskmarket.dev directly (the API blocks
 * cross-origin browser requests), which is exactly why this step exists.
 *
 * Amounts from the API are in micro-units (6 decimals): 1 OUSD = 1,000,000.
 * All derived numbers in data.json are computed here, so every figure on the
 * page can be reproduced from the API responses listed in `meta.endpoints`.
 *
 * Zero dependencies. Node >= 18 (global fetch).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.taskmarket.dev';
const CHAINS = [4217, 8453];
const STATUSES = ['open', 'completed', 'cancelled', 'expired', 'claimed', 'pending_approval', 'worker_selected'];
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'data.json');
const UA = 'taskmarket-live-dashboard/1.0 (+https://taskmarket.dev)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function titleOf(t) {
  const first = (t.description || '').split('\n')[0].trim();
  return first.length > 110 ? first.slice(0, 107) + '…' : first;
}

function trimTask(t) {
  return {
    id: t.id,
    ref: t.referenceCode,
    chain: t.chainId,
    status: t.status,
    mode: t.mode,
    requester: t.requester,
    requesterName: t.requesterDisplayName || null,
    createdAt: t.createdAt,
    expiryTime: t.expiryTime,
    reward: Number(t.reward || 0),
    submissions: t.submissionCount || 0,
    awards: t.awardCount || 0,
    winner: t.primaryAward?.workerAddress || null,
    winnerName: t.workerDisplayName || null,
    title: titleOf(t),
  };
}

function mondayOf(d) {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function fetchAllTasks(chain, status) {
  const out = [];
  let cursor = null;
  let pages = 0;
  do {
    const q = `/api/tasks?chainId=${chain}&status=${status}&sort=newest&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const page = await getJSON(q);
    out.push(...page.tasks.map(trimTask));
    cursor = page.hasMore ? page.nextCursor : null;
    pages++;
    if (pages > 40) break; // safety valve
  } while (cursor);
  return out;
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const errors = [];

  // 1. Headline numbers, per chain.
  const market = {};
  for (const chain of CHAINS) {
    try { market[chain] = await getJSON(`/api/market/stats?chainId=${chain}`); }
    catch (e) { errors.push(`market/stats ${chain}: ${e.message}`); market[chain] = null; }
  }

  // 2. Breakdowns — VERIFIED 2026-11-25: the API returns identical data for
  // chainId 4217 and 8453, so this is platform-wide. Fetched once, shown once.
  const breakdowns = await getJSON('/api/stats/breakdowns?chainId=4217');

  // 3. Time series — also VERIFIED identical across chains (platform-wide).
  const series = {};
  for (const [range, bucket] of [['7d', 'day'], ['30d', 'day'], ['90d', 'day'], ['all', 'week']]) {
    series[range] = await getJSON(`/api/stats/platform-time-series?chainId=4217&range=${range}&bucket=${bucket}`);
  }

  // 4. Heatmaps — also VERIFIED identical across chains (platform-wide).
  const heatHour = await getJSON('/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=hourOfWeek');
  const heatMode = await getJSON('/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=mode');

  // 5. Live activity feed, per chain (limit max is 50 — larger values 400).
  const feed = {};
  for (const chain of CHAINS) {
    feed[chain] = await getJSON(`/api/stats/activity-feed?chainId=${chain}&limit=50`);
  }

  // 6. Full task list, per chain + status (trimmed to the fields we use).
  const tasks = [];
  for (const chain of CHAINS) {
    for (const status of STATUSES) {
      try {
        const batch = await fetchAllTasks(chain, status);
        tasks.push(...batch);
        console.log(`tasks ${chain} ${status}: ${batch.length}`);
      } catch (e) {
        errors.push(`tasks ${chain} ${status}: ${e.message}`);
      }
    }
  }
  console.log(`tasks total: ${tasks.length}`);

  // ---- Aggregations (all reproducible from the fetched payloads) ----
  const byStatus = Object.fromEntries(breakdowns.status.map((s) => [s.status, s.count]));
  const totalTasks = breakdowns.status.reduce((a, s) => a + s.count, 0);
  const died = (byStatus.cancelled || 0) + (byStatus.expired || 0);

  // Distinct posters per week (Monday-anchored), per chain + combined.
  const weeks = {};
  for (const t of tasks) {
    const w = mondayOf(t.createdAt);
    for (const key of [String(t.chain), 'all']) {
      weeks[key] ??= {};
      weeks[key][w] ??= new Set();
      weeks[key][w].add(t.requester.toLowerCase());
    }
  }
  const postersPerWeek = {};
  for (const [key, map] of Object.entries(weeks)) {
    postersPerWeek[key] = Object.entries(map)
      .map(([week, set]) => ({ week, posters: set.size }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  // Poster concentration: top posters by task count and by reward put up.
  const posterAgg = {};
  for (const t of tasks) {
    const k = t.requester.toLowerCase();
    posterAgg[k] ??= { address: t.requester, name: t.requesterName, tasks: 0, reward: 0 };
    posterAgg[k].tasks++;
    posterAgg[k].reward += t.reward;
    if (!posterAgg[k].name && t.requesterName) posterAgg[k].name = t.requesterName;
  }
  const posters = Object.values(posterAgg);
  const topPostersByTasks = [...posters].sort((a, b) => b.tasks - a.tasks).slice(0, 10);
  const topPostersByReward = [...posters].sort((a, b) => b.reward - a.reward).slice(0, 10);
  const totalRewardPutUp = posters.reduce((a, p) => a + p.reward, 0);
  const top5RewardShare = topPostersByReward.slice(0, 5).reduce((a, p) => a + p.reward, 0) / Math.max(1, totalRewardPutUp);

  // Money flow: put up -> paid. Paid = netReward of completed tasks.
  const completed = tasks.filter((t) => t.status === 'completed');
  const paidTotal = completed.reduce((a, t) => a + t.reward, 0);
  const openEscrow = tasks.filter((t) => ['open', 'pending_approval', 'worker_selected', 'claimed'].includes(t.status))
    .reduce((a, t) => a + t.reward, 0);

  // Top winners (completed tasks with a primary award).
  const winnerAgg = {};
  for (const t of completed) {
    if (!t.winner) continue;
    const k = t.winner.toLowerCase();
    winnerAgg[k] ??= { address: t.winner, name: t.winnerName, wins: 0, paid: 0 };
    winnerAgg[k].wins++;
    winnerAgg[k].paid += t.reward;
    if (!winnerAgg[k].name && t.winnerName) winnerAgg[k].name = t.winnerName;
  }
  const topWinners = Object.values(winnerAgg).sort((a, b) => b.paid - a.paid).slice(0, 8);

  // Decision window: expiryTime - createdAt for completed tasks (hours).
  const windows = completed
    .filter((t) => t.expiryTime && t.createdAt)
    .map((t) => (new Date(t.expiryTime) - new Date(t.createdAt)) / 3600000);
  const windowBuckets = {
    under24h: windows.filter((h) => h < 24).length,
    d1_3: windows.filter((h) => h >= 24 && h < 72).length,
    d3_7: windows.filter((h) => h >= 72 && h < 168).length,
    over7d: windows.filter((h) => h >= 168).length,
  };

  // Growth: last 7 days vs the 7 before, from the 30d daily series.
  const s30 = series['30d'];
  const last7 = s30.slice(-7);
  const prev7 = s30.slice(-14, -7);
  const sum = (arr, k) => arr.reduce((a, x) => a + (typeof x[k] === 'string' ? Number(x[k]) : x[k] || 0), 0);
  const avg = (arr, k) => (arr.length ? sum(arr, k) / arr.length : 0);
  const growth = {
    tasksCreated: { last7: sum(last7, 'tasksCreated'), prev7: sum(prev7, 'tasksCreated') },
    activeAgentsAvg: { last7: Math.round(avg(last7, 'activeAgents')), prev7: Math.round(avg(prev7, 'activeAgents')) },
    paidVolume: { last7: sum(last7, 'paidVolume'), prev7: sum(prev7, 'paidVolume') },
    rewardVolume: { last7: sum(last7, 'rewardVolume'), prev7: sum(prev7, 'rewardVolume') },
  };

  // Peak hour from the hour-of-week heatmap.
  let peak = null;
  for (const c of heatHour.cells || []) {
    if (!peak || c.count > peak.count) peak = { day: Number(c.row), hour: Number(c.col), count: c.count };
  }

  // Open tasks (the swarm) + recent completions, trimmed.
  const openTasks = tasks
    .filter((t) => t.status === 'open')
    .sort((a, b) => b.reward - a.reward)
    .slice(0, 400);
  const recentCompleted = completed
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 15);

  const data = {
    fetchedAt,
    generatedBy: 'scripts/fetch-data.mjs (GitHub Actions, hourly)',
    meta: {
      endpoints: [
        '/api/market/stats?chainId=4217',
        '/api/market/stats?chainId=8453',
        '/api/stats/breakdowns?chainId=4217',
        '/api/stats/platform-time-series?chainId=4217&range=7d|30d|90d&bucket=day',
        '/api/stats/platform-time-series?chainId=4217&range=all&bucket=week',
        '/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=hourOfWeek',
        '/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=mode',
        '/api/stats/activity-feed?chainId=4217&limit=50',
        '/api/stats/activity-feed?chainId=8453&limit=50',
        '/api/tasks?chainId=4217|8453&status=<each>&sort=newest&limit=100&cursor=…',
      ],
      chainNotes: {
        marketStats: 'per-chain: only paidWorkers and activeWallets differ by chain; the other fields are echoed identically on both chains.',
        breakdowns: 'platform-wide: the API returns identical breakdowns for chainId 4217 and 8453 (verified 2026-11-25). Shown once, not per chain.',
        timeSeries: 'platform-wide: identical for chainId 4217 and 8453 (verified 2026-11-25).',
        heatmap: 'platform-wide: identical for chainId 4217 and 8453 (verified 2026-11-25).',
        tasks: 'per-chain: /api/tasks is genuinely filtered by chainId.',
        feed: 'per-chain (limit max 50; larger limits return HTTP 400).',
      },
      tasksFetched: tasks.length,
      errors,
    },
    market,
    breakdowns,
    series,
    heatHour,
    heatMode,
    feed: {
      4217: feed[4217]?.items || [],
      8453: feed[8453]?.items || [],
    },
    insights: {
      totalTasks,
      died,
      diedShare: died / Math.max(1, totalTasks),
      postersPerWeek,
      topPostersByTasks,
      topPostersByReward,
      top5RewardShare,
      totalRewardPutUp,
      paidTotal,
      openEscrow,
      topWinners,
      decisionWindow: {
        medianHours: median(windows),
        p25Hours: pct(windows, 25),
        p75Hours: pct(windows, 75),
        n: windows.length,
        buckets: windowBuckets,
      },
      growth,
      peakHour: peak,
    },
    openTasks,
    recentCompleted,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data));
  console.log(`wrote ${OUT} (${(JSON.stringify(data).length / 1024).toFixed(0)} KB), errors: ${errors.length}`);
  if (errors.length) console.error(errors);
}

main().catch((e) => { console.error(e); process.exit(1); });
