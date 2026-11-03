import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

export interface CornerButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Accessible name. */
  label: string;
  side: 'left' | 'right';
}

/** Half-circle button that hugs a screen edge (back, prev/next, menu) (D-022). */
export function CornerButton({ icon, label, side, className, type = 'button', ...rest }: CornerButtonProps) {
  return (
    <button type={type} className={`pm-corner pm-corner-${side}${className ? ` ${className}` : ''}`} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
