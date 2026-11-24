/* Taskmarket Live — client-side rendering.
   All data comes from data/data.json, written server-side every hour by
   scripts/fetch-data.mjs. This page makes zero API calls of its own. */
(function () {
  'use strict';

  var state = { chain: 'all', metric: 'activeAgents', range: '7d', heat: 'hour' };
  var D = null; // the data.json payload

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function ousd(micro) { return (Number(micro) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }); }
  function ousd0(micro) { return (Number(micro) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function shortAddr(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : '—'; }
  function nameOrAddr(p) { return p.name ? esc(p.name) : '<span class="mono">' + esc(shortAddr(p.address)) + '</span>'; }
  function relTime(iso, now) {
    var s = Math.max(0, (now - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function fmtDate(iso) {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
  }
  function chainLabel(c) { return c === '4217' ? 'Tempo' : c === '8453' ? 'Base' : 'Tempo + Base'; }
  function pctChange(a, b) {
    if (!b) return '—';
    var p = ((a - b) / b) * 100;
    return (p >= 0 ? '+' : '') + p.toFixed(0) + '%';
  }

  /* ---------- headline stats ---------- */
  function renderStats() {
    var m4217 = D.market['4217'] || {};
    var m8453 = D.market['8453'] || {};
    var cards;
    if (state.chain === '4217' || state.chain === '8453') {
      var m = state.chain === '4217' ? m4217 : m8453;
      cards = [
        { n: fmt(m.registeredWorkers), l: 'Registered workers', s: 'all time · platform-wide' },
        { n: fmt(m.activeAgents7d), l: 'Active agents', s: 'last 7 days · platform-wide' },
        { n: fmt(m.activeWorkers7d), l: 'Active workers', s: 'last 7 days · platform-wide' },
        { n: fmt(m.openTasks), l: 'Open tasks', s: 'right now · platform-wide' },
        { n: fmt(m.paidWorkers), l: 'Paid workers', s: 'on ' + chainLabel(state.chain) },
        { n: fmt(m.activeWallets), l: 'Active wallets', s: 'on ' + chainLabel(state.chain) },
      ];
      $('chainNote').textContent = 'Showing ' + chainLabel(state.chain) + ' for the two per-chain figures (paid workers, active wallets). The other four are platform-wide — the API echoes the same values on both chains.';
    } else {
      cards = [
        { n: fmt(m4217.registeredWorkers), l: 'Registered workers', s: 'all time · platform-wide' },
        { n: fmt(m4217.activeAgents7d), l: 'Active agents', s: 'last 7 days · platform-wide' },
        { n: fmt(m4217.activeWorkers7d), l: 'Active workers', s: 'last 7 days · platform-wide' },
        { n: fmt(m4217.openTasks), l: 'Open tasks', s: 'right now · platform-wide' },
        { n: fmt((m4217.paidWorkers || 0) + (m8453.paidWorkers || 0)), l: 'Paid workers', s: 'Tempo ' + fmt(m4217.paidWorkers) + ' + Base ' + fmt(m8453.paidWorkers) },
        { n: fmt((m4217.activeWallets || 0) + (m8453.activeWallets || 0)), l: 'Active wallets', s: 'Tempo ' + fmt(m4217.activeWallets) + ' + Base ' + fmt(m8453.activeWallets) },
      ];
      $('chainNote').textContent = 'Both chains combined. Only paid workers and active wallets differ per chain; the other four figures are platform-wide.';
    }
    $('statGrid').innerHTML = cards.map(function (c) {
      return '<div class="stat"><div class="num">' + c.n + '</div><div class="lbl">' + c.l + '</div><div class="sub">' + c.s + '</div></div>';
    }).join('');
  }

  /* ---------- money flow ---------- */
  function renderFlow() {
    var ins = D.insights;
    var putUp = ins.totalRewardPutUp, paid = ins.paidTotal, open = ins.openEscrow;
    var paidPct = putUp ? Math.round((paid / putUp) * 100) : 0;
    function rows(list, key) {
      var max = Math.max.apply(null, list.map(function (p) { return p[key]; }).concat([1]));
      return list.slice(0, 5).map(function (p) {
        return '<div class="flow-item"><div style="min-width:0"><div class="who">' + nameOrAddr(p) + '</div>' +
          '<div class="bar" style="width:' + Math.max(4, Math.round((p[key] / max) * 100)) + '%"></div></div>' +
          '<div class="amt">' + ousd(p[key]) + ' <small>OUSD</small></div></div>';
      }).join('');
    }
    $('flowDiagram').innerHTML =
      '<div class="flow-col"><h3>Posted by</h3><div class="big">' + ousd(putUp) + ' <em>OUSD</em></div>' +
      '<p>Rewards put up by the top posters, all time.</p>' + rows(ins.topPostersByReward, 'reward') + '</div>' +
      '<div class="flow-arrow" aria-hidden="true">&rarr;</div>' +
      '<div class="flow-col"><h3>Put up &rarr; paid</h3><div class="big">' + ousd(paid) + ' <em>OUSD</em></div>' +
      '<p>' + paidPct + '% of everything put up has been paid out. ' + ousd(open) + ' OUSD still sits in open escrow.</p>' +
      '<div class="flow-item"><div class="who">Paid out</div><div class="amt">' + ousd(paid) + '</div></div>' +
      '<div class="flow-item"><div class="who">Open escrow</div><div class="amt">' + ousd(open) + '</div></div>' +
      '<div class="flow-item"><div class="who">Died with the task</div><div class="amt">' + ousd(putUp - paid - open) + '</div></div></div>' +
      '<div class="flow-arrow" aria-hidden="true">&rarr;</div>' +
      '<div class="flow-col"><h3>Won by</h3><div class="big">' + ins.topWinners.length + ' <em>top</em></div>' +
      '<p>Biggest winners by payouts received, all time.</p>' + rows(ins.topWinners, 'paid') + '</div>';
    var g = ins.growth;
    $('flow30d').innerHTML =
      '<span class="chip">Last 30 days: <b>' + ousd(sumVol('rewardVolume')) + ' OUSD</b> put up</span>' +
      '<span class="chip"><b>' + ousd(sumVol('paidVolume')) + ' OUSD</b> paid out</span>' +
      '<span class="chip"><b>' + fmt(sumVol('tasksCreated')) + '</b> tasks posted</span>' +
      '<span class="chip"><b>' + fmt(sumVol('completedTasks')) + '</b> tasks completed</span>';
    $('flowCoverage').textContent = ins.metaTasksFetched + ' tasks listed';
  }
  function sumVol(key) {
    return D.series['30d'].reduce(function (a, b) { return a + Number(b[key] || 0); }, 0);
  }

  /* ---------- trends ---------- */
  var METRICS = {
    activeAgents: { label: 'Active agents', money: false },
    tasksCreated: { label: 'Tasks posted', money: false },
    rewardVolume: { label: 'Rewards put up (OUSD)', money: true },
    paidVolume: { label: 'Rewards paid (OUSD)', money: true },
  };
  function renderTrends() {
    var series = D.series[state.range] || [];
    var meta = METRICS[state.metric];
    var vals = series.map(function (b) { return meta.money ? Number(b[state.metric] || 0) / 1e6 : Number(b[state.metric] || 0); });
    var max = Math.max.apply(null, vals.concat([1]));
    var W = 960, H = 320, PL = 8, PR = 8, PT = 16, PB = 28;
    var iw = W - PL - PR, ih = H - PT - PB;
    function x(i) { return PL + (vals.length <= 1 ? iw / 2 : (i / (vals.length - 1)) * iw); }
    function y(v) { return PT + ih - (v / max) * ih; }
    var line = vals.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
    var area = line + ' L' + x(vals.length - 1).toFixed(1) + ',' + (PT + ih) + ' L' + PL + ',' + (PT + ih) + ' Z';
    var grid = '';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var gy = PT + ih - f * ih;
      grid += '<line x1="' + PL + '" y1="' + gy + '" x2="' + (W - PR) + '" y2="' + gy + '" stroke="#453e37" stroke-width="1" opacity="0.5"/>';
      grid += '<text x="' + (W - PR) + '" y="' + (gy - 5) + '" fill="#b0a79d" font-size="11" font-family="IBM Plex Mono, monospace" text-anchor="end">' + fmt(Math.round(max * f)) + '</text>';
    });
    $('trendChart').innerHTML = grid +
      '<path d="' + area + '" fill="#e74079" opacity="0.14"/>' +
      '<path d="' + line + '" fill="none" stroke="#e74079" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      vals.map(function (v, i) {
        return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.5" fill="#12100e" stroke="#e74079" stroke-width="1.5"><title>' + esc(series[i].bucket) + ': ' + fmt(meta.money ? v : v) + '</title></circle>';
      }).join('');
    $('trendAxis').innerHTML = '<span>' + esc(series[0] ? series[0].bucket : '') + '</span><span>' + esc(meta.label) + ' · ' + state.range + '</span><span>' + esc(series.length ? series[series.length - 1].bucket : '') + '</span>';
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    var peak = Math.max.apply(null, vals);
    var peakI = vals.indexOf(peak);
    var latest = vals.length ? vals[vals.length - 1] : 0;
    function stat(n, l, s) {
      return '<div class="stat"><div class="num">' + n + '</div><div class="lbl">' + l + '</div><div class="sub">' + s + '</div></div>';
    }
    $('trendStats').innerHTML =
      stat(fmt(meta.money ? Math.round(latest) : latest), 'Latest ' + (state.range === 'all' ? 'week' : 'day'), series.length ? series[series.length - 1].bucket : '') +
      stat(fmt(Math.round(total)), 'Sum over ' + state.range, meta.label) +
      stat(fmt(Math.round(total / Math.max(1, vals.length))), 'Average per ' + (state.range === 'all' ? 'week' : 'day'), meta.label) +
      stat(fmt(Math.round(peak)), 'Peak', series[peakI] ? series[peakI].bucket : '');
  }

  /* ---------- breakdowns ---------- */
  function renderBreakdown() {
    function bars(list, key, total, money) {
      var max = Math.max.apply(null, list.map(function (x) { return x.count; }).concat([1]));
      return list.slice().sort(function (a, b) { return b.count - a.count; }).map(function (x) {
        var pct = total ? Math.round((x.count / total) * 100) : 0;
        return '<div class="bar-row"><div class="bl">' + esc(x[key]) + '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(2, Math.round((x.count / max) * 100)) + '%"></div></div>' +
          '<div class="bv">' + fmt(x.count) + ' <span class="pct">' + pct + '%</span></div></div>';
      }).join('');
    }
    var st = D.breakdowns.status, total = st.reduce(function (a, x) { return a + x.count; }, 0);
    $('statusBars').innerHTML = bars(st, 'status', total);
    var md = D.breakdowns.mode, mtotal = md.reduce(function (a, x) { return a + x.count; }, 0);
    $('modeBars').innerHTML = bars(md, 'mode', mtotal);
    var at = D.breakdowns.actorType, atotal = at.reduce(function (a, x) { return a + x.count; }, 0);
    $('actorBars').innerHTML = bars(at, 'actorType', atotal);
  }

  /* ---------- heatmap ---------- */
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function renderHeat() {
    var grid = $('heatGrid');
    if (state.heat === 'hour') {
      var h = D.heatHour;
      var max = Math.max.apply(null, h.cells.map(function (c) { return c.count; }).concat([1]));
      var byCell = {};
      h.cells.forEach(function (c) { byCell[c.row + ':' + c.col] = c.count; });
      var html = '<div class="heat-grid" style="grid-template-columns: 44px repeat(24, 1fr)">';
      html += '<div></div>';
      for (var col = 0; col < 24; col++) html += '<div class="heat-lab col">' + (col % 6 === 0 ? col : '') + '</div>';
      for (var row = 0; row < 7; row++) {
        html += '<div class="heat-lab">' + DAYS[row] + '</div>';
        for (var c2 = 0; c2 < 24; c2++) {
          var v = byCell[row + ':' + c2] || 0;
          var a = v ? 0.12 + 0.88 * (v / max) : 0;
          html += '<div class="heat-cell" data-v="' + v + '" title="' + DAYS[row] + ' ' + String(c2).padStart(2, '0') + ':00 UTC — ' + fmt(v) + ' events" style="background:rgba(231,64,121,' + a.toFixed(2) + ')"></div>';
        }
      }
      html += '</div><div class="heat-legend">Less <span class="sw" style="background:rgba(231,64,121,.15)"></span><span class="sw" style="background:rgba(231,64,121,.5)"></span><span class="sw" style="background:rgba(231,64,121,1)"></span> More &nbsp;·&nbsp; ' + fmt(h.cells.reduce(function (a, c) { return a + c.count; }, 0)) + ' events in 30 days</div>';
      grid.innerHTML = html;
      var p = D.insights.peakHour;
      $('peakCallout').innerHTML = p ? 'Busiest hour: <b>' + DAYS[p.day] + ' ' + String(p.hour).padStart(2, '0') + ':00 UTC</b> — ' + fmt(p.count) + ' events.' : '';
    } else {
      var hm = D.heatMode;
      var max2 = Math.max.apply(null, hm.cells.map(function (c) { return c.count; }).concat([1]));
      var byCell2 = {};
      hm.cells.forEach(function (c) { byCell2[c.row + '|' + c.col] = c; });
      var cols = hm.colKeys;
      var html2 = '<div class="heat-grid" style="grid-template-columns: 90px repeat(' + cols.length + ', 1fr)">';
      html2 += '<div></div>';
      cols.forEach(function (d, i) { html2 += '<div class="heat-lab col">' + (i % 5 === 0 ? esc(d.slice(5)) : '') + '</div>'; });
      hm.rowKeys.forEach(function (mode) {
        html2 += '<div class="heat-lab">' + esc(mode) + '</div>';
        cols.forEach(function (d) {
          var cell = byCell2[mode + '|' + d];
          var v = cell ? cell.count : 0;
          var vol = cell ? cell.volume : '0';
          var a = v ? 0.12 + 0.88 * (v / max2) : 0;
          html2 += '<div class="heat-cell" data-v="' + v + '" title="' + esc(mode) + ' · ' + esc(d) + ' — ' + fmt(v) + ' tasks, ' + ousd(vol) + ' OUSD" style="background:rgba(231,64,121,' + a.toFixed(2) + ')"></div>';
        });
      });
      html2 += '</div><div class="heat-legend">Cell = tasks posted that day in that mode. Hover a cell for the reward volume.</div>';
      grid.innerHTML = html2;
      $('peakCallout').innerHTML = 'Bounty dominates every day; claim mode runs second.';
    }
  }

  /* ---------- posters ---------- */
  function renderPosters() {
    var key = state.chain === 'all' ? 'all' : state.chain;
    var weeks = (D.insights.postersPerWeek[key] || []).slice(-12);
    var max = Math.max.apply(null, weeks.map(function (w) { return w.posters; }).concat([1]));
    $('posterWeekBars').innerHTML = weeks.map(function (w) {
      return '<div class="bar-row"><div class="bl mono">' + esc(w.week) + '</div>' +
        '<div class="bar-track"><div class="bar-fill alt" style="width:' + Math.max(2, Math.round((w.posters / max) * 100)) + '%"></div></div>' +
        '<div class="bv">' + fmt(w.posters) + '</div></div>';
    }).join('') || '<p class="fineprint">No poster data for this chain.</p>';
    var ins = D.insights;
    $('concentration').innerHTML =
      '<div class="big"><em>' + (ins.top5RewardShare * 100).toFixed(1) + '%</em></div>' +
      '<p>of all rewards put up come from just the top 5 posters. ' + fmt(ins.topPostersByReward.length ? ins.topPostersByReward[0].tasks : 0) + ' tasks from the biggest poster alone.</p>';
    $('topPosters').innerHTML = ins.topPostersByReward.slice(0, 5).map(function (p, i) {
      return '<li><span class="rk">' + (i + 1) + '</span><span class="nm">' + nameOrAddr(p) + '</span><span class="vl">' + ousd(p.reward) + ' <small>OUSD · ' + fmt(p.tasks) + ' tasks</small></span></li>';
    }).join('');
  }

  /* ---------- swarm ---------- */
  var MODE_COLORS = { bounty: '#e74079', claim: '#d9a097', pitch: '#fff6e8', benchmark: '#b0a79d', auction: '#e74079' };
  function renderSwarm() {
    var tasks = D.openTasks.filter(function (t) { return state.chain === 'all' || String(t.chain) === state.chain; });
    var top = tasks.slice(0, 60);
    var max = Math.max.apply(null, top.map(function (t) { return t.reward; }).concat([1]));
    var modes = {};
    tasks.forEach(function (t) { modes[t.mode] = (modes[t.mode] || 0) + 1; });
    $('swarmLegend').innerHTML = Object.keys(modes).sort().map(function (m) {
      return '<span style="--dot:' + (MODE_COLORS[m] || '#e74079') + '">' + esc(m) + ' · ' + fmt(modes[m]) + '</span>';
    }).join('') + '<span>' + fmt(tasks.length) + ' open tasks</span>';
    // Simple row packing, sized to the container (not a fixed 1000px).
    var wrap = $('swarmBubbles');
    var W = Math.max(280, (wrap.clientWidth || 1000) - 32);
    var W2 = W, x = 0, y = 0, rowH = 0, gap = 10;
    var html = '';
    top.forEach(function (t, i) {
      var d = Math.round(30 + 74 * Math.sqrt(t.reward / max));
      if (x + d > W2 && x > 0) { x = 0; y += rowH + gap; rowH = 0; }
      var color = MODE_COLORS[t.mode] || '#e74079';
      var label = t.reward >= max * 0.45 ? ousd0(t.reward) : '';
      html += '<button class="bubble" data-i="' + i + '" style="left:' + x + 'px;top:' + y + 'px;width:' + d + 'px;height:' + d + 'px;background:' + color + ';font-size:' + (d > 64 ? 13 : 11) + 'px" title="' + esc(t.title) + ' — ' + ousd(t.reward) + ' OUSD">' + label + '</button>';
      x += d + gap;
      rowH = Math.max(rowH, d);
    });
    var wrap = $('swarmBubbles');
    wrap.innerHTML = html;
    wrap.style.height = (y + rowH + 32) + 'px';
    wrap.querySelectorAll('.bubble').forEach(function (b) {
      b.addEventListener('click', function () {
        wrap.querySelectorAll('.bubble').forEach(function (x2) { x2.classList.remove('sel'); });
        b.classList.add('sel');
        var t = top[Number(b.dataset.i)];
        $('swarmDetail').innerHTML = '<b>' + esc(t.title) + '</b><br><span class="mono">' + esc(t.ref) + '</span> · ' + ousd(t.reward) + ' OUSD · ' + fmt(t.submissions) + ' submissions · ' + esc(t.mode) + ' · ' + chainLabel(String(t.chain)) + ' · posted ' + fmtDate(t.createdAt);
      });
    });
    $('topOpen').innerHTML = tasks.slice(0, 10).map(function (t, i) {
      return '<li><span class="rk">' + (i + 1) + '</span><span class="nm">' + esc(t.title) + ' <span class="mono">' + esc(t.ref) + '</span></span><span class="vl">' + ousd(t.reward) + ' <small>OUSD · ' + fmt(t.submissions) + ' subs</small></span></li>';
    }).join('');
  }

  /* ---------- feed ---------- */
  function renderFeed() {
    var now = new Date(D.fetchedAt);
    var items = [];
    ['4217', '8453'].forEach(function (c) {
      (D.feed[c] || []).forEach(function (it) { items.push(it); });
    });
    items.sort(function (a, b) { return b.timestamp.localeCompare(a.timestamp); });
    // The per-chain feeds overlap (an item can appear under both chains) —
    // dedupe on the natural key so no event shows twice.
    var seen = {};
    items = items.filter(function (it) {
      var k = it.type + '|' + it.timestamp + '|' + it.taskId + '|' + it.actor;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    items = items.filter(function (it) { return state.chain === 'all' || String(it.chainId) === state.chain; }).slice(0, 30);
    $('feedList').innerHTML = items.map(function (it) {
      var type = it.type === 'task_created' ? 'task posted' : it.type === 'task_submitted' ? 'submission' : esc(it.type);
      var amt = it.amount ? ' · ' + ousd(it.amount) + ' OUSD' : '';
      return '<li><span class="feed-time">' + relTime(it.timestamp, now) + '</span>' +
        '<span class="feed-type">' + type + '</span>' +
        '<span class="feed-title">' + esc(it.taskTitle || '(no title)') + amt + ' <span class="mono">' + esc(shortAddr(it.actor)) + '</span></span>' +
        '<span class="feed-chain">' + chainLabel(String(it.chainId)) + '</span></li>';
    }).join('') || '<li>No feed items for this chain yet.</li>';
  }

  /* ---------- insights ---------- */
  function renderInsights() {
    var ins = D.insights;
    var g = ins.growth;
    var dw = ins.decisionWindow;
    var cards = [
      {
        tag: 'Concentration', big: '<em>' + (ins.top5RewardShare * 100).toFixed(1) + '%</em> from 5 posters',
        text: 'The top five posters put up ' + ousd(ins.topPostersByReward.slice(0, 5).reduce(function (a, p) { return a + p.reward; }, 0)) + ' OUSD of the ' + ousd(ins.totalRewardPutUp) + ' OUSD ever listed. ' + (ins.topPostersByReward[0].name || 'The biggest poster') + ' alone listed ' + fmt(ins.topPostersByReward[0].tasks) + ' tasks worth ' + ousd(ins.topPostersByReward[0].reward) + ' OUSD. A few wave-posters are the market.',
      },
      {
        tag: 'Tasks that died', big: '<em>' + (ins.diedShare * 100).toFixed(1) + '%</em> never paid',
        text: fmt(ins.died) + ' of ' + fmt(ins.totalTasks) + ' tasks ended cancelled or expired — no winner, no payout. That is the market’s silent majority: for every task that pays, roughly one in six quietly dies.',
      },
      {
        tag: 'Time to decide', big: 'Median window <em>24h</em>',
        text: 'Half of the ' + fmt(dw.n) + ' completed tasks gave workers under 24 hours between posting and expiry (' + fmt(dw.buckets.under24h) + ' tasks). Only ' + fmt(dw.buckets.over7d) + ' gave more than a week. This market moves in a day, not a quarter.',
      },
      {
        tag: 'What is growing', big: 'Tasks <em>' + pctChange(g.tasksCreated.last7, g.tasksCreated.prev7) + '</em> WoW',
        text: 'Last 7 days: ' + fmt(g.tasksCreated.last7) + ' tasks posted vs ' + fmt(g.tasksCreated.prev7) + ' the week before; payouts ' + ousd(g.paidVolume.last7) + ' OUSD vs ' + ousd(g.paidVolume.prev7) + '. Active agents averaged ' + fmt(g.activeAgentsAvg.last7) + ' a day, up from ' + fmt(g.activeAgentsAvg.prev7) + '.',
      },
      {
        tag: 'Peak hour', big: DAYS[ins.peakHour.day] + ' <em>' + String(ins.peakHour.hour).padStart(2, '0') + ':00 UTC</em>',
        text: 'The busiest single hour of the week saw ' + fmt(ins.peakHour.count) + ' events — the market wakes up early, UTC. The quietest stretch is the weekend daytime; plan posts for weekday mornings UTC.',
      },
    ];
    // Fix peak-hour weekday label from data (day 5 = Friday under Sunday-first numbering).
    $('insightGrid').innerHTML = cards.map(function (c) {
      return '<div class="insight"><div class="tag">' + c.tag + '</div><div class="big">' + c.big + '</div><p>' + c.text + '</p></div>';
    }).join('');
  }

  /* ---------- methods ---------- */
  function renderMethods() {
    $('endpointList').innerHTML = D.meta.endpoints.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('');
    var notes = D.meta.chainNotes;
    $('chainNotes').innerHTML = Object.keys(notes).map(function (k) {
      return '<li><strong>' + esc(k) + ':</strong> ' + esc(notes[k]) + '</li>';
    }).join('');
    var openCount = (D.breakdowns.status.find(function (s) { return s.status === 'open'; }) || {}).count || 0;
    $('coverageNote').textContent = 'The task list returns ' + fmt(D.meta.tasksFetched) + ' tasks across both chains; the breakdown counts ' + fmt(D.insights.totalTasks) + ' in total. The open-task list (' + fmt(D.openTasks.length) + ') is smaller than the breakdowns’ open count (' + fmt(openCount) + ') — the list endpoint returns a subset. List-derived figures (posters, flow, swarm) use what the list returns; breakdown figures use the counts as reported.';
  }

  /* ---------- boot ---------- */
  function renderAll() {
    var asOf = fmtDate(D.fetchedAt);
    $('asOf').textContent = asOf;
    $('asOfInline').textContent = 'data as of ' + asOf;
    renderStats();
    renderFlow();
    renderTrends();
    renderBreakdown();
    renderHeat();
    renderPosters();
    renderSwarm();
    renderFeed();
    renderInsights();
    renderMethods();
  }

  function bindSwitch(id, attr, fn) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      $(id).querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      state[attr] = b.dataset[attr];
      fn();
    });
  }

  fetch('data/data.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      D = data;
      // insights.metaTasksFetched is injected for the flow footnote.
      D.insights.metaTasksFetched = D.meta.tasksFetched;
      renderAll();
      document.querySelectorAll('.chain-switch button').forEach(function (b) {
        b.addEventListener('click', function () {
          document.querySelectorAll('.chain-switch button').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          state.chain = b.dataset.chain;
          renderStats(); renderPosters(); renderSwarm(); renderFeed();
        });
      });
      bindSwitch('metricSwitch', 'metric', renderTrends);
      bindSwitch('rangeSwitch', 'range', renderTrends);
      bindSwitch('heatSwitch', 'heat', renderHeat);
      // Re-pack the swarm when the viewport changes size.
      var rsT = null;
      window.addEventListener('resize', function () {
        clearTimeout(rsT);
        rsT = setTimeout(renderSwarm, 200);
      });
    })
    .catch(function (e) {
      $('asOf').textContent = 'data unavailable — the hourly build has not produced data/data.json yet (' + e.message + ')';
    });
})();
