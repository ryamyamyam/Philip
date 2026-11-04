import { useId, type ReactNode } from 'react';

export interface StatPanelProps {
  title: string;
  /** Visible header text defaults to the title; the region is named by it. */
  children: ReactNode;
  /** «chevron» section tabs, only for panels that really have sub-views. */
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTab?: (id: string) => void;
  /** Right side of the header bar (e.g. a count). */
  aside?: ReactNode;
  className?: string;
}

/**
 * Info panel (D-022): light gray body with faint scanlines under a dark header bar.
 * Renders a named region (aria-labelledby the header title).
 */
export function StatPanel({ title, children, tabs, activeTab, onTab, aside, className }: StatPanelProps) {
  const id = useId();
  return (
    <section className={`pm-panel${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <header className="pm-panel-head">
        <h2 id={id} className="pm-panel-title">
          {title}
        </h2>
        {tabs && tabs.length > 1 && (
          <div className="pm-panel-tabs" role="tablist" aria-label={title}>
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                role="tab"
                className="pm-panel-tab"
                aria-selected={tb.id === activeTab}
                onClick={() => onTab?.(tb.id)}
              >
                {tb.label}
              </button>
            ))}
          </div>
        )}
        {aside}
      </header>
      <div className="pm-panel-body">{children}</div>
    </section>
  );
}
