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

// ---- summary stats over a filtered event set ----------------------------

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; }
function stdev(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * For each event with yield data, compute:
 *  - net move = mean(yields after action) − mean(yields before/at action), in bps
 *  - range = max(window yields) − min(window yields), in bps (always >= 0)
 * Aggregate mean and stdev across the filtered set.
 *
 * Events with fewer than 3 pre and 3 post points are dropped to avoid noise
 * from one-sided windows.
 */
export function computeStats(events) {
  const moves = [];
  const ranges = [];
  for (const ev of events) {
    if (!ev.yields || ev.yields.length < 6) continue;
    const pre = [];
    const post = [];
    for (const p of ev.yields) {
      if (p.date <= ev.date) pre.push(p.y); else post.push(p.y);
    }
    if (pre.length < 3 || post.length < 3) continue;

    const ys = ev.yields.map(p => p.y);
    moves.push((mean(post) - mean(pre)) * 100);   // pct -> bps
    ranges.push((Math.max(...ys) - Math.min(...ys)) * 100);
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
