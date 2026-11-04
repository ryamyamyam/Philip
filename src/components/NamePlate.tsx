export interface NamePlateProps {
  /** Main readout, e.g. the latest weight. */
  title: string;
  /** Secondary line, e.g. the goal. */
  subtitle?: string;
  badge?: { label: string; tone?: 'success' | 'warning' | 'neutral' };
}

/** Angled name plate with a level-style badge (D-022): Progress' weight vs target readout. */
export function NamePlate({ title, subtitle, badge }: NamePlateProps) {
  return (
    <div className="pm-plate">
      <div className="pm-plate-text">
        <p className="pm-plate-title num">{title}</p>
        {subtitle && <p className="pm-plate-sub num">{subtitle}</p>}
      </div>
      {badge && <span className={`pm-plate-badge pm-plate-badge-${badge.tone ?? 'neutral'}`}>{badge.label}</span>}
    </div>
  );
}
