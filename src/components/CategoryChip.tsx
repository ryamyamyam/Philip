import type { ReactNode } from 'react';
import type { CategoryKey } from '../lib/category';

export interface CategoryChipProps {
  category: CategoryKey;
  label: ReactNode;
  /** Decorative emoji, hidden from screen readers. */
  icon?: string;
  className?: string;
}

/** Chamfered category tag (D-022). The text carries the meaning; color only groups. */
export function CategoryChip({ category, label, icon, className }: CategoryChipProps) {
  return (
    <span className={`pm-chip pm-cat-${category}${className ? ` ${className}` : ''}`}>
      {icon && <span aria-hidden="true">{icon} </span>}
      {label}
    </span>
  );
}
