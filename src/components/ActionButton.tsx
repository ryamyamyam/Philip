import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { CategoryKey } from '../lib/category';
import { Icon, type IconName } from './Icon';

interface ActionLook {
  variant?: 'primary' | 'secondary' | 'quiet';
  /** Gradient face color; defaults by variant (primary leaf, secondary sky, quiet slate). */
  category?: CategoryKey;
  icon?: IconName;
  size?: 'lg' | 'md';
  className?: string;
  children: ReactNode;
}

const DEFAULT_CATEGORY: Record<NonNullable<ActionLook['variant']>, CategoryKey> = {
  primary: 'leaf',
  secondary: 'sky',
  quiet: 'slate',
};

function classes({ variant = 'secondary', category, size = 'md', className }: Omit<ActionLook, 'children' | 'icon'>) {
  const cat = category ?? DEFAULT_CATEGORY[variant];
  return `pm-action pm-action-${variant} pm-action-${size} pm-cat-${cat}${className ? ` ${className}` : ''}`;
}

function Face({ icon, children }: Pick<ActionLook, 'icon' | 'children'>) {
  return (
    <span className="pm-action-face">
      {icon && <Icon name={icon} />}
      <span className="pm-action-text">{children}</span>
    </span>
  );
}

export type ActionButtonProps = ActionLook & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

/** Chamfered action button with a light border, dark inner frame and gradient face (D-022). */
export function ActionButton({ variant, category, icon, size, className, children, type = 'button', ...rest }: ActionButtonProps) {
  return (
    <button type={type} className={classes({ variant, category, size, className })} {...rest}>
      <Face icon={icon}>{children}</Face>
    </button>
  );
}

export interface ActionFileButtonProps extends ActionLook {
  accept: string;
  capture?: 'environment' | 'user';
  onFile: (file: File | undefined) => void;
}

/** Same look, wrapping a visually hidden file input (Take photo / Choose photo). */
export function ActionFileButton({ variant, category, icon, size, className, children, accept, capture, onFile }: ActionFileButtonProps) {
  return (
    <label className={classes({ variant, category, size, className })}>
      <Face icon={icon}>{children}</Face>
      <input
        type="file"
        accept={accept}
        capture={capture}
        className="visually-hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}
