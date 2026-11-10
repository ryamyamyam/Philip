import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { clearCoachNotes, deleteCoachNote, META, setMeta } from '../db/repo';
import { useCoachNotes, useMeta } from '../hooks/useData';
import { t } from '../i18n';
import { fmtDate } from '../lib/format';
import { toYmd } from '../lib/date';

/**
 * Settings › Philip's memory (Story 9). What Philip keeps between chats, and what goes into his brief.
 * Plain text (data and privacy), not Philip's voice.
 */
export function MemorySettings() {
  const notes = useCoachNotes();
  const share = useMeta<boolean>(META.coachShareBody) !== false;
  const [forgetting, setForgetting] = useState(false);
  return (
    <section id="settings-memory" className="card stack" aria-labelledby="memory-h">
      <h2 id="memory-h">{t('memory.title')}</h2>
      <p className="small muted">{t('memory.note')}</p>
      <label className="checkbox-row small">
        <input type="checkbox" checked={share} onChange={(e) => void setMeta(META.coachShareBody, e.target.checked)} />
        <span>{t('memory.shareBody')}</span>
      </label>
      <h3 className="small">{t('memory.notesTitle')}</h3>
      {notes && notes.length === 0 && <p className="small muted">{t('memory.empty')}</p>}
      {notes && notes.length > 0 && (
        <ul className="memory-notes" aria-label={t('memory.notesTitle')}>
          {notes.map((n) => (
            <li key={n.id} className="memory-note">
              <span>
                {n.text} <span className="subtle num">· {fmtDate(toYmd(new Date(n.createdAt)), 'short')}</span>
              </span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => n.id !== undefined && void deleteCoachNote(n.id)} aria-label={t('memory.deleteOne', { text: n.text })}>
                {t('memory.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notes && notes.length > 0 && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setForgetting(true)}>
          {t('memory.forgetAll')}
        </button>
      )}
      {forgetting && (
        <ConfirmDialog
          title={t('memory.forgetTitle')}
          body={<p>{t('memory.forgetBody')}</p>}
          confirmLabel={t('memory.forgetConfirm')}
          destructive
          onConfirm={() => {
            setForgetting(false);
            void clearCoachNotes();
          }}
          onCancel={() => setForgetting(false)}
        />
      )}
    </section>
  );
}
