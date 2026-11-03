import { useId, useState } from 'react';
import { t } from '../i18n';
import { Icon } from './Icon';

/** One free-text box with a send button: "2 eggs, 150 g rice, 1 tbsp olive oil" (OBS-BC1840). */
export function FoodTextBox({ onSend, busy = false, autoFocus = false }: { onSend: (text: string) => Promise<void> | void; busy?: boolean; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const id = useId();
  const send = async () => {
    const v = text.trim();
    if (!v || busy) return;
    await onSend(v);
    setText('');
  };
  return (
    <form
      className="food-text"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label className="visually-hidden" htmlFor={id}>
        {t('add.textLabel')}
      </label>
      <textarea
        id={id}
        className="input food-text-input"
        rows={2}
        autoFocus={autoFocus}
        maxLength={2000}
        placeholder={t('add.textPlaceholder')}
        value={text}
        enterKeyHint="send"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <button type="submit" className="btn btn-primary food-text-send" disabled={busy || !text.trim()} aria-label={t('add.textSend')}>
        {busy ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Icon name="send" />}
      </button>
    </form>
  );
}
