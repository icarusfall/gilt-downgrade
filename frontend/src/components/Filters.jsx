const AGENCIES = ["Moody's", "S&P", "Fitch"];

const DIRECTIONS = [
  { id: 'all',  label: 'All' },
  { id: 'down', label: 'Downgrades' },
  { id: 'up',   label: 'Upgrades' },
];

const MAGNITUDES = [
  { id: 'any',     label: 'Any' },
  { id: 'one',     label: '1 notch' },
  { id: 'two_plus',label: '2+ notches' },
  { id: 'outlook', label: 'Outlook only' },
];

const CURRENCIES = [
  { id: 'all',     label: 'All currencies' },
  { id: 'no_usd',  label: 'Exclude USD' },
  { id: 'no_eur',  label: 'Exclude EUR' },
  { id: 'no_both', label: 'Exclude USD & EUR' },
];

function ToggleSet({ options, selected, onToggle, mode = 'multi' }) {
  return (
    <div className="toggle-group">
      {options.map(opt => {
        const id = typeof opt === 'string' ? opt : opt.id;
        const label = typeof opt === 'string' ? opt : opt.label;
        const active = mode === 'single' ? selected === id : selected.includes(id);
        return (
          <button
            key={id}
            className={`toggle-btn ${active ? 'active' : ''}`}
            onClick={() => onToggle(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function Filters({ filters, setFilters, totalCount, matchedCount }) {
  const toggleAgency = (a) => setFilters(f => ({
    ...f,
    agencies: f.agencies.includes(a) ? f.agencies.filter(x => x !== a) : [...f.agencies, a],
  }));

  return (
    <div className="filters">
      <div className="filter-group">
        <span className="filter-label">Agency</span>
        <ToggleSet options={AGENCIES} selected={filters.agencies} onToggle={toggleAgency} />
      </div>

      <div className="filter-group">
        <span className="filter-label">Direction</span>
        <ToggleSet
          options={DIRECTIONS} selected={filters.direction} mode="single"
          onToggle={id => setFilters(f => ({ ...f, direction: id }))}
        />
      </div>

      <div className="filter-group">
        <span className="filter-label">Magnitude</span>
        <ToggleSet
          options={MAGNITUDES} selected={filters.magnitude} mode="single"
          onToggle={id => setFilters(f => ({ ...f, magnitude: id }))}
        />
      </div>

      <div className="filter-group">
        <span className="filter-label">Currency</span>
        <ToggleSet
          options={CURRENCIES} selected={filters.currency} mode="single"
          onToggle={id => setFilters(f => ({ ...f, currency: id }))}
        />
      </div>

      <div className="summary">{matchedCount} / {totalCount} events</div>
    </div>
  );
}
