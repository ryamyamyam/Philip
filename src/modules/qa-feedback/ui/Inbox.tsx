import { Fragment, useId, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { archiveObservations, unarchiveObservations } from '../repository';
import { countByArchive, listFeatures, queryObservations, type ObservationFilter } from '../search';
import { OBSERVATION_TYPES, PRIORITIES, STATUSES, type Observation } from '../types';
import { useQa } from './context';
import { ARCHIVE_TEXT, PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS, fmtDay, fmtWhen } from './strings';

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
  const { db, projectId, filter, setFilter, selection, setSelection, go, notify } = useQa();
  const [limit, setLimit] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);
  const [fromYmd, setFromYmd] = useState('');
  const [toYmd, setToYmd] = useState('');
  const searchId = useId();

  const effective: ObservationFilter = useMemo(() => ({ ...filter, from: dayStart(fromYmd), to: dayEnd(toYmd) }), [filter, fromYmd, toYmd]);
  const key = JSON.stringify(effective);
  const results = useLiveQuery(() => queryObservations(db, projectId, effective), [db, projectId, key]);
  const features = useLiveQuery(() => listFeatures(db, projectId), [db, projectId]);
  const counts = useLiveQuery(() => countByArchive(db, projectId), [db, projectId]);

  const archivedView = filter.status === 'archived';
  // Archived view: newest archive first, grouped by the day they were archived (Story 3).
  const ordered = useMemo(
    () => (results && archivedView ? [...results].sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)) : results),
    [results, archivedView],
  );
  const visible = ordered?.slice(0, limit) ?? [];
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
  const allSelected = !!results && results.length > 0 && results.every((o) => selected.has(o.id));

  // OBS-97D767: archive (or unarchive) by hand — including items already turned into a prompt.
  const archiveSelected = async () => {
    const ids = await archiveObservations(db, projectId, selection);
    setSelection(selection.filter((id) => !ids.includes(id)));
    if (ids.length) notify(ARCHIVE_TEXT.archived(ids.length), { label: ARCHIVE_TEXT.undo, run: () => unarchiveObservations(db, projectId, ids) });
  };
  const unarchiveSelected = async () => {
    const ids = selection.filter((id) => results?.some((o) => o.id === id && o.archivedAt));
    await unarchiveObservations(db, projectId, ids);
    setSelection(selection.filter((id) => !ids.includes(id)));
    if (ids.length) notify(ARCHIVE_TEXT.unarchivedN(ids.length));
  };
  const selectedHere = results ? results.filter((o) => selected.has(o.id)).length : 0;

  const setView = (archived: boolean) => {
    setFilter({ status: archived ? 'archived' : 'open', keyword: filter.keyword });
    setLimit(PAGE);
  };

  return (
    <div className="qa-stack">
      <div className="qa-segmented" role="tablist" aria-label="Feedback list">
        <button type="button" role="tab" aria-selected={!archivedView} onClick={() => setView(false)}>
          {ARCHIVE_TEXT.activeN(counts?.active ?? null)}
        </button>
        <button type="button" role="tab" aria-selected={archivedView} onClick={() => setView(true)}>
          {ARCHIVE_TEXT.archivedN(counts?.archived ?? null)}
        </button>
      </div>
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
            <option value="archived">{ARCHIVE_TEXT.filter}</option>
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
        {/* OBS-9F203A: one toggle — Select all (every match of the current filters) / Unselect all. */}
        {results && results.length > 0 && (
          <button
            type="button"
            className="qa-btn qa-btn-small"
            aria-pressed={allSelected}
            onClick={() => (allSelected ? setSelection([]) : addAll(results))}
          >
            {allSelected ? 'Unselect all' : results.length > visible.length ? `Select all ${results.length}` : 'Select all'}
          </button>
        )}
        {!allSelected && selection.length > 0 && (
          <button type="button" className="qa-btn qa-btn-small" onClick={() => setSelection([])}>
            Unselect all
          </button>
        )}
        {selectedHere > 0 &&
          (archivedView ? (
            <button type="button" className="qa-btn qa-btn-small" onClick={() => void unarchiveSelected()}>
              {ARCHIVE_TEXT.unarchiveSelected(selectedHere)}
            </button>
          ) : (
            <button type="button" className="qa-btn qa-btn-small" onClick={() => void archiveSelected()}>
              {ARCHIVE_TEXT.archiveSelected(selectedHere)}
            </button>
          ))}
      </div>

      {results && results.length === 0 && (
        <p className="qa-empty">
          {filter.keyword || (active && !archivedView) || fromYmd || toYmd ? 'No observations match.' : archivedView ? ARCHIVE_TEXT.emptyArchived : ARCHIVE_TEXT.emptyActive}
        </p>
      )}

      <ul className="qa-list" aria-label="Observations">
        {visible.map((o, i) => {
          const day = archivedView && o.archivedAt ? fmtDay(o.archivedAt) : null;
          const prev = visible[i - 1];
          const showDay = day && (!prev?.archivedAt || fmtDay(prev.archivedAt) !== day);
          return (
          <Fragment key={o.id}>
          {showDay && (
            <li className="qa-day">
              <h3 className="qa-day-heading">{ARCHIVE_TEXT.archivedOn(day)}</h3>
            </li>
          )}
          <li className={`qa-item${o.archivedAt ? ' qa-item-archived' : ''}`}>
            <label className="qa-item-check">
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Select ${o.title}`} />
            </label>
            <button type="button" className="qa-item-main" onClick={() => go({ name: 'detail', id: o.id })}>
              <span className="qa-item-title">{o.title}</span>
              <span className="qa-item-meta">
                {/* The one type chosen at capture, in that type's color (OBS-EF13DE). */}
                <span className={`qa-badge qa-badge-type qa-type-${o.type}`}>
                  <span className="qa-visually-hidden">Type: </span>
                  {TYPE_LABELS[o.type]}
                </span>
                {o.priority && <span className={`qa-badge qa-pri-${o.priority}`}>{PRIORITY_LABELS[o.priority]}</span>}
                {/* "New" is the default for everything just captured; showing it on every row was noise. */}
                {o.status !== 'new' && (
                  <span className="qa-badge qa-badge-status">
                    <span className="qa-visually-hidden">Status: </span>
                    {STATUS_LABELS[o.status]}
                  </span>
                )}
                {o.promptIds.length > 0 && <span className="qa-badge qa-badge-prompt">{ARCHIVE_TEXT.inPrompt}</span>}
                {o.archivedAt && <span className="qa-badge qa-badge-archived">{ARCHIVE_TEXT.badge}</span>}
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
          </Fragment>
          );
        })}
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
      <input id={id} type="date" className="qa-input qa-input-date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
