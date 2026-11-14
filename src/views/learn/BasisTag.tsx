import type { Basis } from '../../db/types';
import { tl } from '../../i18n/learn';

/** Story 14 (OBS-92D8DB): the evidence label on a rule or a lever. Words, not color alone. */
export function BasisTag({ basis }: { basis: Basis }) {
  return (
    <span className="basis-tag" data-basis={basis}>
      {tl(`basis.${basis}`)}
    </span>
  );
}
