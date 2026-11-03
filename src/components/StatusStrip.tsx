import type { ReactNode } from 'react';

export interface StatusStripProps {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  /** Row under the strip, e.g. a DotIndicator. */
  below?: ReactNode;
  className?: string;
}

/** Top status strip (D-022): corner buttons at the edges, title in the middle. */
export function StatusStrip({ left, center, right, below, className }: StatusStripProps) {
  return (
    <header className={`pm-status${className ? ` ${className}` : ''}`}>
      <div className="pm-status-row">
        {left}
        {center}
        {right}
      </div>
      {below}
    </header>
  );
}
