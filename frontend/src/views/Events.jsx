import { useEffect, useMemo, useState } from 'react';
import Plot from '../lib/Plot';
import Filters from '../components/Filters';
import { loadDataset, PLOT_LAYOUT_DEFAULTS, AGENCY_COLOR, eventDirection } from '../lib/dataset';

const DEFAULT_FILTERS = {
  agencies: ["Moody's", "S&P", "Fitch"],
  direction: 'all',
  magnitude: 'any',
  currency: 'all',
};

function matchesFilters(ev, f) {
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

  const ccy = ev.currency_at_event;
  if (f.currency === 'no_usd' && ccy === 'USD') return false;
  if (f.currency === 'no_eur' && ccy === 'EUR') return false;
  if (f.currency === 'no_both' && (ccy === 'USD' || ccy === 'EUR')) return false;

  return true;
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

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.events
      .filter(ev => matchesFilters(ev, filters))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, filters]);

  const selected = filtered.find(e => e.id === selectedId) || filtered[0] || null;

  if (error) return <div className="error">Failed to load dataset: {error}</div>;
  if (!data)  return <div className="loading">Loading dataset…</div>;

  return (
    <div className="view">
      <Filters
        filters={filters}
        setFilters={setFilters}
        totalCount={data.events.length}
        matchedCount={filtered.length}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: 16 }}>
        <div style={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table className="events-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Country</th>
                <th>Agency</th>
                <th>Change</th>
                <th>Δ</th>
                <th>Ccy</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map(ev => {
                const country = countryByIso[ev.country_iso2];
                const isSel = selected && selected.id === ev.id;
                return (
                  <tr
                    key={ev.id}
                    className={`event-row ${isSel ? 'selected' : ''}`}
                    onClick={() => setSelectedId(ev.id)}
                  >
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{ev.date}</td>
                    <td>{country?.name || ev.country_iso2}</td>
                    <td><span className="badge badge-agency">{ev.agency}</span></td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                      {formatRating(ev.old_rating)} <span className="rating-arrow">→</span> {formatRating(ev.new_rating)}
                    </td>
                    <td>{notchBadge(ev)}</td>
                    <td><span className="badge badge-currency">{ev.currency_at_event}</span></td>
                  </tr>
                );
              })}
              {filtered.length > 500 && (
                <tr><td colSpan="6" style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>
                  Showing first 500 of {filtered.length} matching events. Tighten filters to narrow.
                </td></tr>
              )}
              {filtered.length === 0 && (
                <tr><td colSpan="6" style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
                  No events match these filters.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <EventDetail event={selected} country={selected ? countryByIso[selected.country_iso2] : null} />
      </div>
    </div>
  );
}

function EventDetail({ event, country }) {
  if (!event) {
    return <div className="detail-panel detail-empty">Select an event to view its yield window.</div>;
  }
  const traces = event.yields && event.yields.length ? [{
    x: event.yields.map(p => p.date),
    y: event.yields.map(p => p.y),
    type: 'scatter',
    mode: 'lines+markers',
    line: { color: AGENCY_COLOR[event.agency] || '#4fc3f7', width: 2 },
    marker: { size: 4 },
    name: '10y yield',
    hovertemplate: '%{x|%Y-%m-%d}<br>%{y:.2f}%<extra></extra>',
  }] : [];

  const layout = {
    ...PLOT_LAYOUT_DEFAULTS,
    title: { text: '', font: { size: 14 } },
    shapes: [{
      type: 'line',
      x0: event.date, x1: event.date,
      yref: 'paper', y0: 0, y1: 1,
      line: { color: '#ef5350', width: 1.5, dash: 'dash' },
    }],
    annotations: [{
      x: event.date, yref: 'paper', y: 1.02,
      text: 'rating action', showarrow: false,
      font: { size: 10, color: '#ef5350' },
    }],
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
        ? <div className="detail-empty">No yield data available for {country?.name || event.country_iso2} in this window.</div>
        : <Plot
            data={traces}
            layout={layout}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%', height: '440px' }}
          />}
    </div>
  );
}
