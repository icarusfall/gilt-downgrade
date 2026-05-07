// Single-shot dataset loader. The dataset is precomputed by GitHub Actions
// and committed to frontend/public/data/dataset.json, so we just fetch it once.

let _cache = null;

export async function loadDataset() {
  if (_cache) return _cache;
  const res = await fetch('/data/dataset.json');
  if (!res.ok) throw new Error(`dataset fetch failed: ${res.status}`);
  _cache = await res.json();
  return _cache;
}

// Light editorial theme — matches CSS vars in index.css
export const PLOT_LAYOUT_DEFAULTS = {
  paper_bgcolor: '#ffffff',
  plot_bgcolor:  '#ffffff',
  font: { color: '#1f1d1a', family: 'Inter, system-ui, sans-serif', size: 12 },
  xaxis: {
    gridcolor: '#ece6d6', zerolinecolor: '#d6cdb6',
    type: 'date', linecolor: '#c9c1ad',
  },
  yaxis: {
    gridcolor: '#ece6d6', zerolinecolor: '#d6cdb6',
    title: { text: '10y yield (%)', font: { size: 11, color: '#59544c' } },
    ticksuffix: '%', linecolor: '#c9c1ad',
  },
  legend: { bgcolor: 'rgba(0,0,0,0)' },
  margin: { l: 55, r: 25, t: 30, b: 40 },
  hovermode: 'x unified',
};

export const AGENCY_COLOR = {
  "Moody's": '#7e3af2',  // warm purple
  "S&P":     '#1d4ed8',  // deep blue
  "Fitch":   '#c2410c',  // burnt orange
};

export function eventDirection(notches) {
  if (notches == null) return 'unknown';
  if (notches > 0) return 'up';
  if (notches < 0) return 'down';
  return 'flat';
}

// ---- per-event and aggregate yield-response stats -----------------------

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const stdev = (xs) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

export const DEFAULT_POLICY = { preDays: 365, postDays: 365, mode: 'avg' };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Add `days` (positive or negative) to an ISO YYYY-MM-DD string. */
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Split an event's yield series into the pre and post sub-windows defined by
 * the policy. Each sub-window is the points within `days` of the event date,
 * on the appropriate side. Both arrays are sorted ascending by date.
 */
export function splitWindow(ev, policy = DEFAULT_POLICY) {
  const pre = [], post = [];
  if (!ev.yields) return { pre, post };
  const preCutoff  = addDays(ev.date, -policy.preDays);
  const postCutoff = addDays(ev.date,  policy.postDays);
  for (const p of ev.yields) {
    if (p.date >= preCutoff && p.date <= ev.date) pre.push(p);
    else if (p.date > ev.date && p.date <= postCutoff) post.push(p);
  }
  pre.sort((a, b) => a.date.localeCompare(b.date));
  post.sort((a, b) => a.date.localeCompare(b.date));
  return { pre, post };
}

/** True iff there's at least one point in each user-chosen window. */
export function hasUsefulYields(ev, policy = DEFAULT_POLICY) {
  const { pre, post } = splitWindow(ev, policy);
  return pre.length >= 1 && post.length >= 1;
}

/**
 * Aggregated pre and post values according to the policy mode:
 *   - 'avg':  mean of all points in the window
 *   - 'edge': pre = earliest point in pre window (start of lead-up)
 *             post = latest point in post window (end of period)
 * Returns { pre_val, post_val, pre_anchor, post_anchor } where the anchors
 * are the date strings at which to draw the chart marker.
 * Returns null if either side has zero points.
 */
export function eventPrePostMeans(ev, policy = DEFAULT_POLICY) {
  const { pre, post } = splitWindow(ev, policy);
  if (!pre.length || !post.length) return null;
  if (policy.mode === 'edge') {
    return {
      pre_val:    pre[0].y,
      post_val:   post[post.length - 1].y,
      pre_anchor: pre[0].date,
      post_anchor: post[post.length - 1].date,
    };
  }
  return {
    pre_val:    mean(pre.map(p => p.y)),
    post_val:   mean(post.map(p => p.y)),
    pre_anchor: pre[0].date,           // line spans from start of window
    post_anchor: post[post.length - 1].date,
  };
}

/** Per-event net move in bps under the given policy, or null if not computable. */
export function eventMove(ev, policy = DEFAULT_POLICY) {
  const m = eventPrePostMeans(ev, policy);
  return m ? (m.post_val - m.pre_val) * 100 : null;
}

/** Max − min in bps within the *combined* pre+post window. */
export function eventRange(ev, policy = DEFAULT_POLICY) {
  const { pre, post } = splitWindow(ev, policy);
  const ys = [...pre, ...post].map(p => p.y);
  if (!ys.length) return null;
  return (Math.max(...ys) - Math.min(...ys)) * 100;
}

/** Aggregate stats over a filtered event set, using the given policy. */
export function computeStats(events, policy = DEFAULT_POLICY) {
  const moves = [];
  const ranges = [];
  for (const ev of events) {
    const m = eventMove(ev, policy);
    if (m == null) continue;
    moves.push(m);
    const r = eventRange(ev, policy);
    if (r != null) ranges.push(r);
  }
  return {
    n: moves.length,
    move_mean: mean(moves), move_std: stdev(moves),
    range_mean: mean(ranges), range_std: stdev(ranges),
  };
}

export function fmtBps(x) {
  if (!Number.isFinite(x)) return '—';
  const sign = x > 0 ? '+' : '';
  return `${sign}${Math.round(x)}`;
}
