import { DialogBar } from '../components/DialogBar';
import { GymCharacter } from '../components/GymCharacter';
import { CornerButton } from '../components/CornerButton';
import { StatusStrip } from '../components/StatusStrip';
import { t } from '../i18n';
import { useUI } from '../ui';

/**
 * Workout section (Story 5). T-011 ships the route and the frame; Today's session (T-013) and the
 * cycle plan with the goal briefing (T-014) fill it in.
 */
export default function WorkoutView({ plan = false }: { plan?: boolean }) {
  const { navigate } = useUI();
  return (
    <div className="view view-workout">
      <StatusStrip
        left={<CornerButton side="left" icon="chevronLeft" label={t('workout.backHome')} onClick={() => navigate('home')} />}
        center={
          <div className="home-title">
            <h1 className="pm-display">{t(plan ? 'workout.planTitle' : 'workout.title')}</h1>
          </div>
        }
      />
      <div className="stack">
        <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="phone" framing="bust" scale={2} className="pm-dialog-portrait" />}>
          {t('workout.comingSoon')}
        </DialogBar>
        {!plan && (
          <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('workoutPlan')}>
            {t('workout.openPlan')}
          </button>
        )}
      </div>
    </div>
  );
}
