import { useMemo } from 'react';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { Sheet } from '../../components/Sheet';
import { useCycles, useProfile, useTrainingProgram } from '../../hooks/useData';
import { t } from '../../i18n';
import { tl } from '../../i18n/learn';
import { SOURCES, whyPlan, type Rule } from '../../lib/learn/whyPlan';
import { trainingDaysOrDefault } from '../../lib/training/schedule';
import type { Phase } from '../../lib/training/program';
import { useUI } from '../../ui';
import { BasisTag } from './BasisTag';

/**
 * Story 14 (OBS-92D8DB): "Why this plan". Explains the owner's own plan from the engine's constants:
 * what a cut and a bulk change (and what they don't), the week, how Philip adjusts. Every rule has an
 * evidence label; research-backed ones name their sources. Static: works offline and with no AI.
 */
export default function WhyPlanSheet({ phase: asked }: { phase?: Phase }) {
  const { closeSheet } = useUI();
  const profile = useProfile();
  const program = useTrainingProgram();
  const cycles = useCycles();
  const cycle = program && program.currentCycle > 0 ? (cycles?.find((c) => c.index === program.currentCycle) ?? null) : null;
  const phase: Phase = asked ?? cycle?.phase ?? 'gain';
  const plan = useMemo(
    () =>
      whyPlan({
        phase,
        days: trainingDaysOrDefault(program?.trainingDays).length,
        strengthMin: program?.availability?.strengthMin ?? null,
        sex: profile?.sex ?? null,
      }),
    [phase, program?.trainingDays, program?.availability?.strengthMin, profile?.sex],
  );

  return (
    <Sheet title={tl('learn.title')} onClose={closeSheet} full>
      <div className="stack why-plan">
        <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="point-up" framing="bust" scale={2} className="pm-dialog-portrait" />}>
          {tl('learn.line')}
        </DialogBar>

        <section className="card stack-sm" aria-labelledby="why-legend">
          <h3 id="why-legend">{tl('learn.legend.title')}</h3>
          <ul className="why-legend stack-xs">
            {(['research', 'practice', 'default'] as const).map((b) => (
              <li key={b} className="small">
                {tl(`learn.legend.${b}`)}
              </li>
            ))}
          </ul>
        </section>

        <section className="card stack-sm" aria-labelledby="why-phase">
          <h3 id="why-phase">{tl('learn.sec.phase')}</h3>
          <p className="small">{plan.intro}</p>
          <ul className="why-rules stack-sm">
            {plan.compare.map((r) => (
              <RuleItem key={r.id} rule={r} phase={phase} />
            ))}
          </ul>
        </section>

        <section className="card stack-sm" aria-labelledby="why-week">
          <h3 id="why-week">{tl('learn.sec.week')}</h3>
          <ul className="why-rules stack-sm">
            {plan.week.map((r) => (
              <RuleItem key={r.id} rule={r} phase={phase} />
            ))}
          </ul>
        </section>

        <section className="card stack-sm" aria-labelledby="why-adjust">
          <h3 id="why-adjust">{tl('learn.sec.adjust')}</h3>
          <ul className="why-rules stack-sm">
            {plan.adjust.map((r) => (
              <RuleItem key={r.id} rule={r} phase={phase} />
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}

function RuleItem({ rule, phase }: { rule: Rule; phase: Phase }) {
  const now = ` (${tl('learn.now')})`;
  return (
    <li className="why-rule stack-xs" data-rule={rule.id}>
      <span className="why-rule-head">
        <strong>{rule.title}</strong> <BasisTag basis={rule.basis} />
      </span>
      {rule.both && (
        <span className="small">
          <span className="why-side">{tl('learn.both')}:</span> {rule.both}
        </span>
      )}
      {rule.cut && (
        <span className={`small${phase === 'lose' ? ' why-now' : ''}`}>
          <span className="why-side">
            {tl('learn.cut')}
            {phase === 'lose' ? now : ''}:
          </span>{' '}
          {rule.cut}
        </span>
      )}
      {rule.bulk && (
        <span className={`small${phase === 'gain' ? ' why-now' : ''}`}>
          <span className="why-side">
            {tl('learn.bulk')}
            {phase === 'gain' ? now : ''}:
          </span>{' '}
          {rule.bulk}
        </span>
      )}
      {rule.text && <span className="small">{rule.text}</span>}
      {rule.why && <span className="small muted">{rule.why}</span>}
      {rule.sources.map((s) => (
        <span key={s} className="small muted why-source">
          {tl('learn.source', { cite: SOURCES[s] })}
        </span>
      ))}
    </li>
  );
}
