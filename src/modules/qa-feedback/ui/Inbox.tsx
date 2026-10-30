import { useId, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listFeatures, queryObservations, type ObservationFilter } from '../search';
import { OBSERVATION_TYPES, PRIORITIES, STATUSES, type Observation } from '../types';
import { useQa } from './context';
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS, fmtWhen } from './strings';

const PAGE = 50;

function dayStart(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}
function dayEnd(ymd: string): number | null {
  const s = dayStart(ymd);
  return s == null ? null : s + 86_400_000 - 1;
}

export function Inbox() {
  const { db, projectId, filter, setFilter, selection, setSelection, go } = useQa();
  const [limit, setLimit] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);
  const [fromYmd, setFromYmd] = useState('');
  const [toYmd, setToYmd] = useState('');
  const searchId = useId();

  const effective: ObservationFilter = useMemo(() => ({ ...filter, from: dayStart(fromYmd), to: dayEnd(toYmd) }), [filter, fromYmd, toYmd]);
  const key = JSON.stringify(effective);
  const results = useLiveQuery(() => queryObservations(db, projectId, effective), [db, projectId, key]);
  const features = useLiveQuery(() => listFeatures(db, projectId), [db, projectId]);

  const visible = results?.slice(0, limit) ?? [];
  const selected = useMemo(() => new Set(selection), [selection]);
  const update = (f: Partial<ObservationFilter>) => {
    setFilter({ ...filter, ...f });
    setLimit(PAGE);
  };
  const active =
    (filter.status && filter.status !== 'open') ||
    (filter.priority && filter.priority !== 'all') ||
    (filter.type && filter.type !== 'all') ||
    !!filter.feature ||
    !!fromYmd ||
    !!toYmd;

  const toggle = (id: string) => setSelection(selected.has(id) ? selection.filter((x) => x !== id) : [...selection, id]);
  const addAll = (list: Observation[]) => setSelection([...new Set([...selection, ...list.map((o) => o.id)])]);

  return (
    <div className="qa-stack">
      <div className="qa-row">
        <label className="qa-visually-hidden" htmlFor={searchId}>
          Search observations
        </label>
        <input
          id={searchId}
          type="search"
          className="qa-input"
          placeholder="Search title, words, feature…"
          value={filter.keyword ?? ''}
          onChange={(e) => update({ keyword: e.target.value })}
          enterKeyHint="search"
        />
        <button type="button" className="qa-btn qa-btn-secondary" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
          Filters{active ? ' •' : ''}
        </button>
      </div>

      {showFilters && (
        <div className="qa-filters" role="group" aria-label="Filters">
          <FilterSelect label="Status" value={filter.status ?? 'open'} onChange={(v) => update({ status: v as ObservationFilter['status'] })}>
            <option value="open">Open</option>
            <option value="all">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Priority" value={filter.priority ?? 'all'} onChange={(v) => update({ priority: v as ObservationFilter['priority'] })}>
            <option value="all">Any</option>
            <option value="none">Not set</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Type" value={filter.type ?? 'all'} onChange={(v) => update({ type: v as ObservationFilter['type'] })}>
            <option value="all">Any</option>
            {OBSERVATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Feature / screen" value={filter.feature ?? ''} onChange={(v) => update({ feature: v || undefined })}>
            <option value="">Any</option>
            {(features ?? []).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </FilterSelect>
          <DateInput label="From" value={fromYmd} onChange={setFromYmd} />
          <DateInput label="To" value={toYmd} onChange={setToYmd} />
          <button
            type="button"
            className="qa-btn qa-btn-small"
            onClick={() => {
              setFilter({ status: 'open', keyword: filter.keyword });
              setFromYmd('');
              setToYmd('');
            }}
          >
            Reset filters
          </button>
        </div>
      )}

      <div className="qa-row qa-wrap qa-toolbar">
        <span className="qa-hint" aria-live="polite">
          {results ? `${results.length} shown${selection.length ? ` · ${selection.length} selected` : ''}` : 'Loading…'}
        </span>
        <span className="qa-spacer" />
        {results && results.length > 0 && (
          <>
            <button type="button" className="qa-btn qa-btn-small" onClick={() => addAll(visible)}>
              Select visible
            </button>
            {results.length > visible.length && (
              <button type="button" className="qa-btn qa-btn-small" onClick={() => addAll(results)}>
                Select all {results.length}
              </button>
            )}
          </>
        )}
        {selection.length > 0 && (
          <button type="button" className="qa-btn qa-btn-small" onClick={() => setSelection([])}>
            Clear selection
          </button>
        )}
      </div>

      {results && results.length === 0 && (
        <p className="qa-empty">{filter.keyword || active ? 'No observations match.' : 'Nothing captured yet. Use Capture to add your first observation.'}</p>
      )}

      <ul className="qa-list" aria-label="Observations">
        {visible.map((o) => (
          <li key={o.id} className="qa-item">
            <label className="qa-item-check">
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Select ${o.title}`} />
            </label>
            <button type="button" className="qa-item-main" onClick={() => go({ name: 'detail', id: o.id })}>
              <span className="qa-item-title">{o.title}</span>
              <span className="qa-item-meta">
                <span className={`qa-badge qa-type-${o.type}`}>{TYPE_LABELS[o.type]}</span>
                {o.priority && <span className={`qa-badge qa-pri-${o.priority}`}>{PRIORITY_LABELS[o.priority]}</span>}
                <span className="qa-badge">{STATUS_LABELS[o.status]}</span>
                {o.feature && <span className="qa-item-feature">{o.feature}</span>}
                {o.attachmentCount > 0 && (
                  <span className="qa-item-shots" aria-label={`${o.attachmentCount} screenshots`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h3l2-3h6l2 3h3v12H4V7Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                    </svg>
                    {o.attachmentCount}
                  </span>
                )}
                <span className="qa-item-date">{fmtWhen(o.createdAt)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {results && results.length > visible.length && (
        <button type="button" className="qa-btn qa-btn-secondary" onClick={() => setLimit(limit + PAGE)}>
          Show more ({results.length - visible.length} more)
        </button>
      )}

      {selection.length > 0 && (
        <div className="qa-sticky-actions">
          <button type="button" className="qa-btn qa-btn-primary qa-btn-block" onClick={() => go({ name: 'prompt' })}>
            Build prompt from {selection.length} selected
          </button>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="qa-field">
      <label className="qa-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="qa-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="qa-field">
      <label className="qa-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="date" className="qa-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
