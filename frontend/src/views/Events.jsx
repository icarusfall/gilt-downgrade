import { useEffect, useMemo, useState } from 'react';
import Plot from '../lib/Plot';
import Filters from '../components/Filters';
import {
  loadDataset, PLOT_LAYOUT_DEFAULTS, AGENCY_COLOR,
  eventDirection, computeStats, eventMove, hasUsefulYields,
  eventPrePostMeans, fmtBps,
} from '../lib/dataset';

const DEFAULT_FILTERS = {
  agencies: ["Moody's", "S&P", "Fitch"],
  direction: 'all',
  magnitude: 'any',
  excludedCurrencies: [],   // toggled by clicking chips
  keepDeFromEur: false,     // GBP-comparator escape hatch: exclude EUR but keep DE
  yields: 'any',
};

// Returns true iff the event's currency is currently being filtered out.
function isCurrencyExcluded(ev, f) {
  const ccy = ev.currency_at_event;
  if (!f.excludedCurrencies.includes(ccy)) return false;
  if (ccy === 'EUR' && f.keepDeFromEur && ev.country_iso2 === 'DE') return false;
  return true;
}

function matchesNonCurrency(ev, f) {
  if (!f.agencies.includes(ev.agency)) return false;

  const dir = eventDirection(ev.notches);
  if (f.direction === 'down' && dir !== 'down') return false;
  if (f.direction === 'up'   && dir !== 'up')   return false;

  if (f.magnitude === 'outlook' && !ev.is_outlook_only) return false;
  if (f.magnitude !== 'outlook' && f.magnitude !== 'any' && ev.is_outlook_only) return false;
  if (f.magnitude === 'one') {
    if (ev.notches == null || Math.abs(ev.notches) !== 1) return false;
  }
  if (f.magnitude === 'two_plus') {
    if (ev.notches == null || Math.abs(ev.notches) < 2) return false;
  }

  if (f.yields === 'only' && !hasUsefulYields(ev)) return false;

  return true;
}

function matchesFilters(ev, f) {
  return matchesNonCurrency(ev, f) && !isCurrencyExcluded(ev, f);
}

function formatRating(r) { return r ?? '—'; }

function notchBadge(ev) {
  const dir = eventDirection(ev.notches);
  const cls = dir === 'down' ? 'badge-down' : dir === 'up' ? 'badge-up' : 'badge-flat';
  if (ev.is_outlook_only) {
    return <span className={`badge ${cls}`}>outlook</span>;
  }
  if (ev.notches == null) {
    return <span className="badge badge-flat">—</span>;
  }
  const sign = ev.notches > 0 ? '+' : '';
  return <span className={`badge ${cls}`}>{sign}{ev.notches}</span>;
}

function chipTooltip(stat) {
  const { ccy, n, n_with_move, move_mean, countries } = stat;
  const lines = [];
  lines.push(`${ccy} · ${n} event${n === 1 ? '' : 's'}`);
  if (n_with_move > 0) {
    lines.push(`avg net 12mo move: ${fmtBps(move_mean)} bps  (n=${n_with_move})`);
  } else {
    lines.push('no events with usable yield window');
  }
  if (countries.length) {
    lines.push('');
    lines.push(countries.map(([name, k]) => `${name} (${k})`).join(', '));
  }
  return lines.join('\n');
}

function StatsStrip({ stats, totalCount, matchedCount, currencyStats, excluded, onToggleCcy, onResetCcy, onGbpComparator }) {
  const moveClass = stats.move_mean > 0 ? 'up' : stats.move_mean < 0 ? 'down' : '';
  return (
    <div className="stats">
      <div className="stat">
        <span className="stat-label">Events</span>
        <span className="stat-value">{matchedCount}</span>
        <span className="stat-note">of {totalCount} ({stats.n} with yields)</span>
      </div>
      <div className="stat">
        <span className="stat-label">Net 12mo yield move</span>
        <span className={`stat-value ${moveClass}`}>
          {fmtBps(stats.move_mean)} <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>± {fmtBps(stats.move_std)}</span>
        </span>
        <span className="stat-note">bps, post-event avg − pre</span>
      </div>
      <div className="stat">
        <span className="stat-label">Window range</span>
        <span className="stat-value">
          {fmtBps(stats.range_mean)} <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>± {fmtBps(stats.range_std)}</span>
        </span>
        <span className="stat-note">bps, max − min in ±12mo</span>
      </div>
      <div className="stat" style={{ flex: 1, minWidth: 260 }}>
        <div className="ccy-header">
          <span className="stat-label">Currencies in set</span>
          <div className="ccy-actions">
            <button className="ccy-action" onClick={onResetCcy} title="Include every currency">All</button>
            <button className="ccy-action" onClick={onGbpComparator} title="Exclude USD and EUR (but keep Germany — the EUR benchmark)">GBP comparator</button>
          </div>
        </div>
        <div className="ccy-chips">
          {currencyStats.length === 0
            ? <span className="stat-note" style={{ paddingTop: 2 }}>—</span>
            : currencyStats.map(s => {
                const isExcl = excluded.includes(s.ccy);
                return (
                  <button
                    key={s.ccy}
                    type="button"
                    className={`ccy-chip ${isExcl ? 'excluded' : ''}`}
                    title={chipTooltip(s)}
                    onClick={() => onToggleCcy(s.ccy)}
                  >
                    {s.ccy}<span className="ccy-chip-n">{s.n}</span>
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
}

export default function Events() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    loadDataset().then(setData).catch(e => setError(String(e)));
  }, []);

  const countryByIso = useMemo(() => {
    if (!data) return {};
    return Object.fromEntries(data.countries.map(c => [c.iso2, c]));
  }, [data]);

  // Per-country max yield date — used to tell users "your event is past
  // our data cutoff" vs "this country has no series at all".
  const lastYieldByCountry = useMemo(() => {
    if (!data) return {};
    const out = {};
    for (const ev of data.events) {
      if (!ev.yields || !ev.yields.length) continue;
      const last = ev.yields[ev.yields.length - 1].date;
      if (!out[ev.country_iso2] || last > out[ev.country_iso2]) {
        out[ev.country_iso2] = last;
      }
    }
    return out;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.events
      .filter(ev => matchesFilters(ev, filters))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, filters]);

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  // Currency chips show all currencies that would be present if the user
  // hadn't applied any currency exclusions, so excluded chips remain visible
  // and can be re-enabled with one click.
  const currencyStats = useMemo(() => {
    if (!data) return [];
    const candidates = data.events.filter(ev => matchesNonCurrency(ev, filters));
    const grouped = new Map();   // ccy -> { events: [], countries: Map<iso2, count> }
    for (const ev of candidates) {
      const c = ev.currency_at_event;
      if (!grouped.has(c)) grouped.set(c, { events: [], countries: new Map() });
      const g = grouped.get(c);
      g.events.push(ev);
      g.countries.set(ev.country_iso2, (g.countries.get(ev.country_iso2) || 0) + 1);
    }
    const out = [];
    for (const [ccy, g] of grouped) {
      const moves = g.events.map(eventMove).filter(x => x != null);
      const avg = moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : NaN;
      const countries = [...g.countries.entries()]
        .map(([iso, n]) => [countryByIso[iso]?.name || iso, n])
        .sort((a, b) => b[1] - a[1]);
      out.push({ ccy, n: g.events.length, n_with_move: moves.length, move_mean: avg, countries });
    }
    return out.sort((a, b) => b.n - a.n);
  }, [data, filters, countryByIso]);

  const toggleCcy = (ccy) => setFilters(f => ({
    ...f,
    excludedCurrencies: f.excludedCurrencies.includes(ccy)
      ? f.excludedCurrencies.filter(x => x !== ccy)
      : [...f.excludedCurrencies, ccy],
    keepDeFromEur: ccy === 'EUR' ? false : f.keepDeFromEur,
  }));

  const resetCcy = () => setFilters(f => ({ ...f, excludedCurrencies: [], keepDeFromEur: false }));
  const gbpComparator = () => setFilters(f => ({
    ...f,
    excludedCurrencies: ['USD', 'EUR'],
    keepDeFromEur: true,
  }));
  // Default selection = most recent event with enough surrounding yield data
  // to be analysable, so the chart isn't empty when you land on the page.
  const firstUseful = filtered.find(hasUsefulYields);
  const selected = filtered.find(e => e.id === selectedId) || firstUseful || filtered[0] || null;

  if (error) return <div className="error">Failed to load dataset: {error}</div>;
  if (!data)  return <div className="loading">Loading dataset…</div>;

  return (
    <div className="view">
      <Filters filters={filters} setFilters={setFilters} />
      <StatsStrip
        stats={stats}
        totalCount={data.events.length}
        matchedCount={filtered.length}
        currencyStats={currencyStats}
        excluded={filters.excludedCurrencies}
        onToggleCcy={toggleCcy}
        onResetCcy={resetCcy}
        onGbpComparator={gbpComparator}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: 16 }}>
        <div className="events-panel">
          <table className="events-table">
            <thead>
              <tr>
                <th title="Yield data available?" style={{ width: 18 }}></th>
                <th>Date</th>
                <th>Country</th>
                <th>Agency</th>
                <th>Change</th>
                <th>Δ</th>
                <th>Ccy</th>
                <th title="Net 12mo yield move: post-event mean − pre-event mean, in bps" style={{ textAlign: 'right' }}>Move (bps)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map(ev => {
                const country = countryByIso[ev.country_iso2];
                const isSel = selected && selected.id === ev.id;
                const hasY = hasUsefulYields(ev);
                const move = eventMove(ev);
                const moveCls = move == null ? '' : move > 0 ? 'move-up' : move < 0 ? 'move-down' : '';
                return (
                  <tr
                    key={ev.id}
                    className={`event-row ${isSel ? 'selected' : ''} ${hasY ? '' : 'no-yields'}`}
                    onClick={() => setSelectedId(ev.id)}
                  >
                    <td style={{ textAlign: 'center', padding: '8px 4px' }} title={hasY ? `${ev.yields.length} monthly points (≥6 post-event)` : 'insufficient post-event yield data'}>
                      <span style={{
                        display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                        background: hasY ? 'var(--success)' : 'transparent',
                        border: hasY ? 'none' : '1px solid var(--border-strong)',
                      }} />
                    </td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{ev.date}</td>
                    <td>{country?.name || ev.country_iso2}</td>
                    <td><span className="badge badge-agency">{ev.agency}</span></td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                      {formatRating(ev.old_rating)} <span className="rating-arrow">→</span> {formatRating(ev.new_rating)}
                    </td>
                    <td>{notchBadge(ev)}</td>
                    <td><span className="badge badge-currency">{ev.currency_at_event}</span></td>
                    <td className={`move-cell ${moveCls}`}>{move == null ? '—' : fmtBps(move)}</td>
                  </tr>
                );
              })}
              {filtered.length > 500 && (
                <tr><td colSpan="8" style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>
                  Showing first 500 of {filtered.length} matching events. Tighten filters to narrow.
                </td></tr>
              )}
              {filtered.length === 0 && (
                <tr><td colSpan="8" style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
                  No events match these filters.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <EventDetail
          event={selected}
          country={selected ? countryByIso[selected.country_iso2] : null}
          lastYieldDate={selected ? lastYieldByCountry[selected.country_iso2] : null}
        />
      </div>
    </div>
  );
}

function emptyReason(event, country, lastYieldDate) {
  if (!country?.has_yields) {
    return `${country?.name || event.country_iso2} has no harmonised 10y yield series in our data source.`;
  }
  if (lastYieldDate && event.date > lastYieldDate) {
    return `Yield data for ${country.name} ends ${lastYieldDate.slice(0, 7)}; this event is past the source cutoff (OECD MEI, currently early 2024).`;
  }
  if (lastYieldDate && event.yields.length === 0) {
    return `No yield data overlaps the ±12mo window around ${event.date} (data starts later than that).`;
  }
  return `No yield data available for ${country?.name || event.country_iso2} in this window.`;
}

function EventDetail({ event, country, lastYieldDate }) {
  if (!event) {
    return <div className="detail-panel detail-empty">Select an event to view its yield window.</div>;
  }
  const traces = [];
  let annotations = [{
    x: event.date, yref: 'paper', y: 1.02,
    text: 'rating action', showarrow: false,
    font: { size: 10, color: '#b91c1c' },
  }];

  if (event.yields && event.yields.length) {
    traces.push({
      x: event.yields.map(p => p.date),
      y: event.yields.map(p => p.y),
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: AGENCY_COLOR[event.agency] || '#1d4ed8', width: 2 },
      marker: { size: 4 },
      name: '10y yield',
      hovertemplate: '%{x|%Y-%m-%d}<br>%{y:.2f}%<extra></extra>',
    });

    // Pre/post mean overlays — make the "net move" stat literally visible
    const means = eventPrePostMeans(event);
    if (means) {
      const preDates = event.yields.filter(p => p.date <= event.date);
      const postDates = event.yields.filter(p => p.date > event.date);
      const firstPre = preDates[0].date;
      const lastPost = postDates[postDates.length - 1].date;
      const move = (means.post_mean - means.pre_mean) * 100;   // bps
      const postColor = move > 5 ? '#b91c1c' : move < -5 ? '#15803d' : '#78716c';

      traces.push({
        x: [firstPre, event.date],
        y: [means.pre_mean, means.pre_mean],
        type: 'scatter', mode: 'lines',
        line: { color: '#78716c', width: 1.5, dash: 'dash' },
        name: `pre avg ${means.pre_mean.toFixed(2)}%`,
        hovertemplate: `pre-event mean: %{y:.2f}%<extra></extra>`,
      });
      traces.push({
        x: [event.date, lastPost],
        y: [means.post_mean, means.post_mean],
        type: 'scatter', mode: 'lines',
        line: { color: postColor, width: 1.5, dash: 'dash' },
        name: `post avg ${means.post_mean.toFixed(2)}% (${fmtBps(move)} bps)`,
        hovertemplate: `post-event mean: %{y:.2f}%<extra></extra>`,
      });

      annotations.push({
        x: firstPre, y: means.pre_mean, xanchor: 'left', yanchor: 'bottom',
        text: `${means.pre_mean.toFixed(2)}%`,
        showarrow: false,
        font: { size: 10, color: '#59544c', family: 'JetBrains Mono, monospace' },
        bgcolor: 'rgba(255,255,255,0.85)', borderpad: 2,
      });
      annotations.push({
        x: lastPost, y: means.post_mean, xanchor: 'right', yanchor: 'bottom',
        text: `${means.post_mean.toFixed(2)}% (${fmtBps(move)} bps)`,
        showarrow: false,
        font: { size: 10, color: postColor, family: 'JetBrains Mono, monospace' },
        bgcolor: 'rgba(255,255,255,0.85)', borderpad: 2,
      });
    }
  }

  const layout = {
    ...PLOT_LAYOUT_DEFAULTS,
    title: { text: '', font: { size: 14 } },
    shapes: [{
      type: 'line',
      x0: event.date, x1: event.date,
      yref: 'paper', y0: 0, y1: 1,
      line: { color: '#b91c1c', width: 1.5, dash: 'dash' },
    }],
    annotations,
    showlegend: false,   // legend would crowd the chart; values live in annotations
  };

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-title">{country?.name || event.country_iso2}</div>
        <div className="detail-sub">{event.agency} · {event.date}</div>
      </div>
      <div className="detail-sub" style={{ marginBottom: 8 }}>
        {event.old_rating || '—'}{event.old_outlook ? ` (${event.old_outlook})` : ''}
        {' → '}
        {event.new_rating || '—'}{event.new_outlook ? ` (${event.new_outlook})` : ''}
        {' · '}{event.currency_at_event}
      </div>
      {traces.length === 0
        ? <div className="detail-empty">{emptyReason(event, country, lastYieldDate)}</div>
        : <Plot
            data={traces}
            layout={layout}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%', height: '440px' }}
          />}
    </div>
  );
}
