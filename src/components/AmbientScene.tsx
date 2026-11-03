/**
 * Ambient "world" surface (D-022): flat vector ground, path and foliage with soft oval shadows and
 * 1px outlines. Only for empty states, onboarding and the photo-analysis wait. Always decorative.
 * `analyzing` adds a magnifier that sweeps over a plate (static under reduced motion).
 */
export function AmbientScene({ variant }: { variant: 'empty' | 'analyzing' }) {
  return (
    <svg className={`pm-world pm-world-${variant}`} viewBox="0 0 320 120" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMax slice">
      <rect className="pm-world-sky" x="0" y="0" width="320" height="120" />
      <path className="pm-world-ground" d="M0 70 Q80 58 160 66 T320 62 V120 H0 Z" />
      <path className="pm-world-path" d="M138 120 Q150 92 172 80 Q190 71 214 70 L226 72 Q200 78 188 90 Q174 104 170 120 Z" />
      {/* Foliage: rounded bushes and two trees */}
      <ellipse className="pm-world-shadow" cx="44" cy="84" rx="26" ry="5" />
      <circle className="pm-world-leaf" cx="34" cy="74" r="13" />
      <circle className="pm-world-leaf-2" cx="52" cy="76" r="11" />
      <ellipse className="pm-world-shadow" cx="282" cy="80" rx="22" ry="4.5" />
      <rect className="pm-world-trunk" x="278" y="58" width="8" height="22" rx="2" />
      <circle className="pm-world-leaf" cx="282" cy="48" r="17" />
      <ellipse className="pm-world-shadow" cx="250" cy="96" rx="16" ry="3.5" />
      <circle className="pm-world-leaf-2" cx="250" cy="89" r="9" />
      <ellipse className="pm-world-shadow" cx="92" cy="102" rx="12" ry="3" />
      <circle className="pm-world-leaf-2" cx="92" cy="96" r="7" />
      {/* Plate on the path */}
      <ellipse className="pm-world-shadow" cx="160" cy="92" rx="30" ry="6" />
      <ellipse className="pm-world-plate" cx="160" cy="86" rx="28" ry="9" />
      <ellipse className="pm-world-plate-in" cx="160" cy="85" rx="18" ry="5.5" />
      <circle className="pm-world-food-a" cx="153" cy="83" r="4" />
      <circle className="pm-world-food-b" cx="164" cy="82" r="3.5" />
      <rect className="pm-world-food-c" x="158" y="84" width="9" height="4" rx="1.5" />
      {variant === 'analyzing' && (
        <g className="pm-world-lens">
          <circle className="pm-world-lens-glass" cx="172" cy="60" r="12" />
          <path className="pm-world-lens-handle" d="M181 69 L192 80" />
        </g>
      )}
    </svg>
  );
}
