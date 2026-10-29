import { useId, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import type { Meal, YMD } from '../../db/types';
import { t } from '../../i18n';
import { AnalysisError, claudeHandoffPrompt, parseAnalysisText } from '../../services/foodAnalysis';
import { useUI } from '../../ui';
import { fromAnalysis } from './reviewModel';

/**
 * Manual Claude handoff. Philip cannot call the Claude app: the user copies the prompt,
 * attaches the photo in Claude, then pastes Claude's JSON reply back here.
 */
export default function HandoffSheet({ date, meal, file }: { date: YMD; meal: Meal; file: File | null }) {
  const { closeSheet, openSheet } = useUI();
  const prompt = useMemo(() => claudeHandoffPrompt(), []);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [reply, setReply] = useState('');
  const [error, setError] = useState(false);
  const promptId = useId();
  const replyId = useId();

  const canSharePhoto = useMemo(() => {
    if (!file || typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }, [file]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setReply(text);
        setError(false);
      }
    } catch {
      /* user can paste manually */
    }
  };

  const review = () => {
    try {
      const result = parseAnalysisText(reply);
      openSheet({
        kind: 'review',
        date,
        meal,
        items: fromAnalysis(result.items),
        provider: 'claude-handoff',
        model: 'claude (manual handoff)',
        notes: result.notes,
        analyzedAt: Date.now(),
      });
    } catch (e) {
      if (e instanceof AnalysisError || e instanceof Error) setError(true);
    }
  };

  return (
    <Sheet
      title={t('handoff.title')}
      onClose={closeSheet}
      full
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={review} disabled={!reply.trim()}>
          {t('handoff.review')}
        </button>
      }
    >
      <div className="stack">
        <p className="subtle">{t('handoff.note')}</p>
        <ol className="steps">
          <li>{t('handoff.step1')}</li>
          <li>{t('handoff.step2')}</li>
          <li>{t('handoff.step3')}</li>
        </ol>
        <div className="field">
          <label className="field-label" htmlFor={promptId}>
            {t('handoff.promptLabel')}
          </label>
          <textarea id={promptId} className="textarea prompt-box" readOnly value={prompt} onFocus={(e) => e.currentTarget.select()} />
        </div>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary" onClick={copy}>
            <Icon name={copied === 'ok' ? 'check' : 'copy'} /> {copied === 'ok' ? t('handoff.copied') : t('handoff.copyPrompt')}
          </button>
          {canSharePhoto && file && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void navigator.share({ files: [file] }).catch(() => undefined)}
            >
              <Icon name="upload" /> {t('photo.sharePhoto')}
            </button>
          )}
        </div>
        {copied === 'fail' && <p className="field-error">{t('handoff.copyFailed')}</p>}

        <div className="field">
          <label className="field-label" htmlFor={replyId}>
            {t('handoff.pasteLabel')}
          </label>
          <textarea
            id={replyId}
            className="textarea"
            value={reply}
            placeholder={t('handoff.pastePlaceholder')}
            aria-invalid={error || undefined}
            onChange={(e) => {
              setReply(e.target.value);
              setError(false);
            }}
          />
          {error && <span className="field-error">{t('handoff.parseError')}</span>}
        </div>
        <button type="button" className="btn btn-secondary" onClick={paste}>
          <Icon name="clipboard" /> {t('handoff.pasteButton')}
        </button>
      </div>
    </Sheet>
  );
}
