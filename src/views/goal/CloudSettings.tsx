import { useState } from 'react';
import { useCloudPaired } from '../../hooks/useCoach';
import { tg } from '../../i18n/goal';
import { cloudUrl, pingCloud, setCloudToken } from '../../services/coachCloud';

/**
 * Story 11 §5.2: Settings › Philip in the cloud. Pair this phone with the Worker (the token is a
 * Worker secret you set once; see push-worker/README.md). Stored on this device only.
 */
export function CloudSettings() {
  const paired = useCloudPaired();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'bad' | 'unreachable'>('idle');
  const url = cloudUrl();

  const pair = async () => {
    const tk = token.trim();
    if (!tk) return;
    setStatus('testing');
    const r = await pingCloud(tk);
    if (r === 'ok') {
      await setCloudToken(tk);
      setToken('');
      setStatus('idle');
    } else setStatus(r === 'unauthorized' ? 'bad' : 'unreachable');
  };

  return (
    <section className="stack-sm settings-sub" aria-labelledby="cloud-h">
      <h3 id="cloud-h">{tg('cloud.title')}</h3>
      <p className="small">{tg('cloud.note')}</p>
      {!url ? (
        <p className="small muted">{tg('cloud.none')}</p>
      ) : paired ? (
        <>
          <p className="small">{tg('cloud.paired')}</p>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => void setCloudToken(null)}>
            {tg('cloud.unpair')}
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">{tg('cloud.token')}</span>
            <input className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
          <button type="button" className="btn btn-block" disabled={!token.trim() || status === 'testing'} onClick={() => void pair()}>
            {status === 'testing' ? tg('cloud.testing') : tg('cloud.pair')}
          </button>
          {status === 'bad' && <p className="small field-error" role="alert">{tg('cloud.bad')}</p>}
          {status === 'unreachable' && <p className="small field-error" role="alert">{tg('cloud.unreachable')}</p>}
        </>
      )}
    </section>
  );
}
