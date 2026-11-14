import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DialogBar } from '../components/DialogBar';
import { GymCharacter } from '../components/GymCharacter';
import { Icon } from '../components/Icon';
import { loadBrief } from '../db/coachBrief';
import { addCoachMessage, addCoachNotes, clearCoachMessages } from '../db/repo';
import { useCoachMessages, useProfile } from '../hooks/useData';
import { t } from '../i18n';
import { askPrompt, parseAskReply } from '../lib/coach/memory';
import { takeAskDraft } from '../lib/coach/askDraft';
import { todayYmd } from '../lib/date';
import { useUI } from '../ui';
import { useCloudPaired } from '../hooks/useCoach';
import ReplanButton from './goal/ReplanButton';

/**
 * Ask Philip (Story 9, `#/ask`): a chat outside any workout. Every question goes to Gemini with
 * Philip's brief (the whole history, notes and earlier chats), so he answers from real numbers.
 * Advice only: plan changes still come from a workout report, where each one is validated.
 */
export default function AskView() {
  const { navigate } = useUI();
  const profile = useProfile();
  const messages = useCoachMessages();
  const cloud = useCloudPaired();
  const key = profile?.geminiKey ?? (cloud ? 'cloud' : null);
  // OBS-3037F2: a question handed over from another screen (e.g. after a weigh-in) pre-fills the box.
  const [text, setText] = useState(() => takeAskDraft() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [clearing, setClearing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages?.length, busy]);

  const send = async () => {
    const q = text.trim().slice(0, 1000);
    if (!key || !q || busy) return;
    const history = messages ?? [];
    await addCoachMessage({ from: 'me', text: q, at: Date.now() });
    setText('');
    setBusy(true);
    setError(false);
    try {
      // This chat goes in as its own history, so the brief leaves it out.
      const brief = await loadBrief(todayYmd(), { excludeAsk: true });
      const { coachJson } = await import('../services/coachAi');
      const { raw } = await coachJson(askPrompt(brief, history, q), { apiKey: profile?.geminiKey ?? null, model: profile?.geminiModel ?? null });
      const reply = parseAskReply(raw);
      if (!reply) throw new Error('bad reply');
      await addCoachMessage({ from: 'philip', text: reply.message, at: Date.now() });
      if (reply.remember.length) await addCoachNotes(reply.remember, { source: 'ask', sessionId: null });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view view-ask">
      <header className="view-header view-header-back">
        <button type="button" className="icon-btn" onClick={() => navigate('home')} aria-label={t('ask.back')}>
          <Icon name="chevronLeft" />
        </button>
        <h1>{t('ask.title')}</h1>
      </header>
      <div className="stack">
        <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose="cross-smug" framing="bust" scale={2} className="pm-dialog-portrait" />}>
          {key ? t('ask.intro') : t('ask.noKey')}
        </DialogBar>
        <ReplanButton />
        <section className="card stack-sm" aria-labelledby="ask-h">
          <h2 id="ask-h" className="visually-hidden">
            {t('ask.title')}
          </h2>
          {messages && messages.length === 0 && <p className="small muted">{t('ask.empty')}</p>}
          {messages && messages.length > 0 && (
            <ol className="report-thread" aria-label={t('ask.thread')}>
              {messages.map((m) => (
                <li key={m.id} className={`report-msg${m.from === 'me' ? ' is-me' : ''}`}>
                  <span className="report-who">{m.from === 'me' ? t('report.me') : t('coach.speaker')}:</span> {m.text}
                </li>
              ))}
            </ol>
          )}
          {busy && (
            <p className="small muted" role="status">
              {t('report.thinking')}
            </p>
          )}
          {error && (
            <p className="small" role="alert">
              {t('report.error')}
            </p>
          )}
          {key ? (
            <form
              className="stack-sm"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label className="field">
                <span className="field-label">{t('ask.label')}</span>
                <textarea className="input" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy || !text.trim()}>
                {t('report.send')}
              </button>
            </form>
          ) : (
            <button type="button" className="btn btn-block" onClick={() => navigate('settings')}>
              {t('ask.toSettings')}
            </button>
          )}
          <div ref={endRef} />
        </section>
        <p className="small muted">{t('ask.memoryNote')}</p>
        <div className="ex-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate('settings')}>
            {t('ask.manageMemory')}
          </button>
          {messages && messages.length > 0 && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setClearing(true)}>
              {t('ask.clear')}
            </button>
          )}
        </div>
      </div>
      {clearing && (
        <ConfirmDialog
          title={t('ask.clearTitle')}
          body={<p>{t('ask.clearBody')}</p>}
          confirmLabel={t('ask.clearConfirm')}
          destructive
          onConfirm={() => {
            setClearing(false);
            void clearCoachMessages();
          }}
          onCancel={() => setClearing(false)}
        />
      )}
    </div>
  );
}
