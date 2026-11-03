export interface DotIndicatorProps {
  count: number;
  active: number;
  /** Spoken description. Without it the dots are decorative (the heading already says where you are). */
  label?: string;
}

/** Row of position dots (D-022). */
export function DotIndicator({ count, active, label }: DotIndicatorProps) {
  return (
    <span className="pm-dots" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`pm-dot${i === active ? ' pm-dot-active' : ''}`} />
      ))}
    </span>
  );
}
