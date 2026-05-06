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

export const PLOT_LAYOUT_DEFAULTS = {
  paper_bgcolor: '#1a1a2e',
  plot_bgcolor: '#1a1a2e',
  font: { color: '#e0e0e0', family: 'Inter, system-ui, sans-serif', size: 12 },
  xaxis: { gridcolor: '#2a2a4a', zerolinecolor: '#2a2a4a', type: 'date' },
  yaxis: {
    gridcolor: '#2a2a4a', zerolinecolor: '#2a2a4a',
    title: { text: '10y yield (%)' }, ticksuffix: '%',
  },
  legend: { bgcolor: 'rgba(0,0,0,0)' },
  margin: { l: 55, r: 25, t: 30, b: 40 },
  hovermode: 'x unified',
};

export const AGENCY_COLOR = {
  "Moody's": '#ce93d8',
  "S&P":     '#4fc3f7',
  "Fitch":   '#ffb74d',
};

export function eventDirection(notches) {
  if (notches == null) return 'unknown';
  if (notches > 0) return 'up';
  if (notches < 0) return 'down';
  return 'flat';
}
