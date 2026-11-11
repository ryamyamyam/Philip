import { useState } from 'react';
import { useToast } from '../components/Toast';
import { updateTrainingProgram } from '../db/repo';
import type { TrainingProgram, Treadmill } from '../db/types';
import { useProfile } from '../hooks/useData';
import { t, type StringKey } from '../i18n';
import { parseDecimal } from '../lib/numbers';
import { defaultTreadmill, parseTreadmillEstimate, settingToMph, TREADMILL_LIMITS, treadmillPrompt, validTreadmill } from '../lib/training/treadmill';

const SCALES: Treadmill['scale'][] = ['mph', 'kmh', 'level'];
const SCALE_KEY: Record<Treadmill['scale'], StringKey> = { mph: 'treadmill.scale.mph', kmh: 'treadmill.scale.kmh', level: 'treadmill.scale.level' };

/**
 * Settings › Training › Your treadmill (Story 10, OBS-E19B38). Name the machine, Philip estimates what
 * its speed number means (Gemini key needed), and the owner can correct it. Cardio logs then show the
 * projected mph next to the machine setting.
 */
export function TreadmillSettings({ program }: { program: TrainingProgram }) {
  const toast = useToast();
  const profile = useProfile();
  const saved = program.treadmill ?? defaultTreadmill(program.weightUnit === 'lb' ? 'mph' : 'kmh');
  const [name, setName] = useState(saved.name);
  const [scale, setScale] = useState<Treadmill['scale']>(saved.scale);
  const [maxLevel, setMaxLevel] = useState(saved.maxLevel !== undefined ? String(saved.maxLevel) : '');
  const [maxMph, setMaxMph] = useState(saved.maxMph !== undefined ? String(saved.maxMph) : '');
  const [minMph, setMinMph] = useState(saved.minMph !== undefined ? String(saved.minMph) : '');
  const [source, setSource] = useState<Treadmill['source']>(saved.source);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const num = (v: string) => {
    const x = parseDecimal(v);
    return x === null || !Number.isFinite(x) ? undefined : x;
  };
  const draft: Treadmill = {
    name: name.trim().slice(0, TREADMILL_LIMITS.nameChars),
    scale,
    ...(scale === 'level' && num(maxLevel) !== undefined ? { maxLevel: Math.round(num(maxLevel)!) } : {}),
    ...(scale === 'level' && num(maxMph) !== undefined ? { maxMph: num(maxMph)! } : {}),
    ...(scale === 'level' && num(minMph) !== undefined ? { minMph: num(minMph)! } : {}),
    source,
  };
  const ok = validTreadmill(draft);
  const example = scale === 'mph' ? null : settingToMph(5, draft);

  const ask = async () => {
    if (!profile?.geminiKey || !name.trim()) return;
    setAsking(true);
    setNote(null);
    try {
      const { coachCheckinWithGemini, DEFAULT_GEMINI_MODEL, normalizeModel } = await import('../services/foodAnalysis/gemini');
      const raw = await coachCheckinWithGemini({ apiKey: profile.geminiKey, model: normalizeModel(profile.geminiModel ?? DEFAULT_GEMINI_MODEL), text: treadmillPrompt(name) });
      const est = parseTreadmillEstimate(raw, name);
      if (!est) {
        setNote(t('treadmill.askFailed'));
        return;
      }
      setScale(est.treadmill.scale);
      setMaxLevel(est.treadmill.maxLevel !== undefined ? String(est.treadmill.maxLevel) : '');
      setMaxMph(est.treadmill.maxMph !== undefined ? String(est.treadmill.maxMph) : '');
      setMinMph(est.treadmill.minMph !== undefined ? String(est.treadmill.minMph) : '');
      setSource('philip');
      setNote(t(est.confidence === 'low' ? 'treadmill.guessLow' : 'treadmill.guess', { note: est.note || t(SCALE_KEY[est.treadmill.scale]) }));
    } catch {
      setNote(t('treadmill.askFailed'));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="stack-sm">
      <h3>{t('treadmill.title')}</h3>
      <p className="small">{t('treadmill.why')}</p>
      <label className="field">
        <span className="field-label">{t('treadmill.name')}</span>
        <input className="input" value={name} maxLength={TREADMILL_LIMITS.nameChars} placeholder={t('treadmill.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
      </label>
      {profile?.geminiKey ? (
        <button type="button" className="btn btn-secondary btn-block" disabled={!name.trim() || asking} onClick={() => void ask()}>
          {asking ? t('checkin.thinking') : t('treadmill.ask')}
        </button>
      ) : (
        <p className="small muted">{t('treadmill.noKey')}</p>
      )}
      {note && (
        <p className="small" role="status">
          {note}
        </p>
      )}
      <span className="field-label">{t('treadmill.scale')}</span>
      <div className="segmented" role="radiogroup" aria-label={t('treadmill.scale')}>
        {SCALES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={scale === s}
            onClick={() => {
              setScale(s);
              setSource('me');
            }}
          >
            {t(SCALE_KEY[s])}
          </button>
        ))}
      </div>
      {scale === 'level' && (
        <div className="setup-inputs">
          <label className="field">
            <span className="field-label">{t('treadmill.maxLevel')}</span>
            <input className="input num" inputMode="numeric" value={maxLevel} onChange={(e) => (setMaxLevel(e.target.value), setSource('me'))} />
          </label>
          <label className="field">
            <span className="field-label">{t('treadmill.maxMph')}</span>
            <input className="input num" inputMode="decimal" value={maxMph} onChange={(e) => (setMaxMph(e.target.value), setSource('me'))} />
          </label>
          <label className="field">
            <span className="field-label">{t('treadmill.minMph')}</span>
            <input className="input num" inputMode="decimal" value={minMph} placeholder="0.5" onChange={(e) => (setMinMph(e.target.value), setSource('me'))} />
          </label>
        </div>
      )}
      {example !== null && <p className="small muted num">{t('treadmill.example', { n: 5, mph: example })}</p>}
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={!ok}
        onClick={() => void updateTrainingProgram({ treadmill: draft }).then(() => toast(t('treadmill.saved')))}
      >
        {t('treadmill.save')}
      </button>
    </div>
  );
}
