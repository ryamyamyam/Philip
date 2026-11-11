import { useState } from 'react';
import { CornerButton } from '../components/CornerButton';
import { DialogBar } from '../components/DialogBar';
import { GymCharacter } from '../components/GymCharacter';
import { StatusStrip } from '../components/StatusStrip';
import {
  useCycles,
  useProfile,
  useSlotChoices,
  useTmHistory,
  useTrainingProgram,
  useWeightEntries,
  useWorkoutSessions,
} from '../hooks/useData';
import { t } from '../i18n';
import type { ExerciseId } from '../lib/training/exercises';
import { workoutCardState } from '../lib/training/progress';
import { todayYmd } from '../lib/date';
import { useUI } from '../ui';
import { SessionView } from './workout/SessionView';
import { SetupView } from './workout/SetupView';
import { StartCycleView } from './workout/StartCycleView';
import { WorkoutCalendar } from './workout/WorkoutCalendar';
import { PlanView } from './workout/PlanView';

/**
 * Workout section (Story 5). Setup → cycle briefing → today's session; `plan` is the cycle plan.
 */
export default function WorkoutView({ plan = false }: { plan?: boolean }) {
  const { navigate } = useUI();
  // Owner feedback (Nov 5): Workout opens on a calendar; today's session is one tap away.
  const [inSession, setInSession] = useState(false);
  // Story 6 §2: the cycle briefing can open on a day whose workout is already done (no training today).
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  // Story 10 (OBS-7BAD75): a reopened log opens once the live query shows it as the open workout.
  const [editRequested, setEditRequested] = useState(false);
  const program = useTrainingProgram();
  const sessions = useWorkoutSessions();
  const cycles = useCycles();
  const tmHistory = useTmHistory();
  const choices = useSlotChoices();
  const profile = useProfile();
  const weights = useWeightEntries();
  const loaded = program !== undefined && sessions && cycles && tmHistory && choices && profile && weights;

  let body: React.ReactNode = null;
  if (plan) {
    const cycle = loaded ? (cycles.find((c) => c.index === program?.currentCycle) ?? null) : null;
    const choiceMap = loaded ? (Object.fromEntries(choices.map((c) => [c.slotKey, c.exerciseId])) as Record<string, ExerciseId>) : {};
    body =
      loaded && program && cycle ? (
        <PlanView program={program} cycle={cycle} sessions={sessions} tmHistory={tmHistory} choices={choiceMap} />
      ) : loaded ? (
        <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="phone" framing="bust" scale={2} className="pm-dialog-portrait" />}>
          {t('plan.noCycle')}
        </DialogBar>
      ) : null;
  } else if (loaded) {
    const state = workoutCardState(program, sessions, todayYmd());
    const cycle = cycles.find((c) => c.index === program?.currentCycle) ?? null;
    const choiceMap = Object.fromEntries(choices.map((c) => [c.slotKey, c.exerciseId])) as Record<string, ExerciseId>;
    if (!program || state.kind === 'setup') body = <SetupView />;
    else if (state.kind === 'briefing' || state.kind === 'cycleDone' || !cycle || (briefingOpen && state.kind === 'doneToday' && state.cycleDone)) {
      body = <StartCycleView profile={profile} weights={weights} cycles={cycles} sessions={sessions} tmHistory={tmHistory} />;
    } else if (!inSession && !(editRequested && state.kind === 'resume')) {
      body = (
        <WorkoutCalendar
          sessions={sessions}
          state={state}
          program={program}
          cycle={cycle}
          tmHistory={tmHistory}
          profile={profile}
          weights={weights}
          choices={choiceMap}
          justFinished={justFinished}
          onEdit={() => setEditRequested(true)}
          onOpenToday={() => {
            setJustFinished(false);
            if (state.kind === 'doneToday') setBriefingOpen(true);
            else setInSession(true);
          }}
        />
      );
    } else {
      body = (
        <SessionView
          program={program}
          cycle={cycle}
          sessions={sessions}
          tmHistory={tmHistory}
          choices={choiceMap}
          open={state.kind === 'resume' ? state.session : null}
          onBack={(finished) => {
            setJustFinished(finished);
            setInSession(false);
            setEditRequested(false);
          }}
        />
      );
    }
  }

  return (
    <div className="view view-workout">
      <StatusStrip
        left={
          <CornerButton
            side="left"
            icon="chevronLeft"
            label={t(plan ? 'workout.backWorkout' : inSession || briefingOpen || editRequested ? 'workout.backCalendar' : 'workout.backHome')}
            onClick={() =>
              plan ? navigate('workout') : inSession || briefingOpen || editRequested ? (setInSession(false), setBriefingOpen(false), setEditRequested(false)) : navigate('home')
            }
          />
        }
        center={
          <div className="home-title">
            <h1 className="pm-display">{t(plan ? 'workout.planTitle' : 'workout.title')}</h1>
          </div>
        }
        right={
          !plan && program ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate('workoutPlan')}>
              {t('workout.openPlan')}
            </button>
          ) : undefined
        }
      />
      {body}
    </div>
  );
}
