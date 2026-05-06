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

// Minimum number of monthly yield points required *after* the event for a
// post-window to be useful. 6 months is enough to show whether the market
// reacted; less than that often means the yield series ends shortly after
// the event and a reading would be misleading.
const MIN_POST_POINTS = 6;
const MIN_PRE_POINTS  = 3;

/** Split a yield window into (pre, post) arrays around the event date. */
function splitWindow(ev) {
  const pre = [], post = [];
  if (!ev.yields) return { pre, post };
  for (const p of ev.yields) {
    if (p.date <= ev.date) pre.push(p.y); else post.push(p.y);
  }
  return { pre, post };
}

/** True iff the event has enough surrounding yield data to be analysable. */
export function hasUsefulYields(ev) {
  const { pre, post } = splitWindow(ev);
  return pre.length >= MIN_PRE_POINTS && post.length >= MIN_POST_POINTS;
}

/**
 * Per-event "net 12mo yield move" = mean(post-event yields) − mean(pre-event
 * yields), in bps. Returns null if the window doesn't meet the minimum
 * pre/post point thresholds.
 */
export function eventMove(ev) {
  const { pre, post } = splitWindow(ev);
  if (pre.length < MIN_PRE_POINTS || post.length < MIN_POST_POINTS) return null;
  return (mean(post) - mean(pre)) * 100;
}

export function eventRange(ev) {
  if (!hasUsefulYields(ev)) return null;
  const ys = ev.yields.map(p => p.y);
  return (Math.max(...ys) - Math.min(...ys)) * 100;
}

/**
 * Aggregate stats over a filtered event set: mean ± stdev of net moves and
 * window ranges. Events without a usable move are simply skipped.
 */
export function computeStats(events) {
  const moves = [];
  const ranges = [];
  for (const ev of events) {
    const m = eventMove(ev);
    if (m == null) continue;
    moves.push(m);
    const r = eventRange(ev);
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
