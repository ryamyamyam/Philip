import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import './styles/today.css';
import './styles/views.css';
import { App } from './App';
import { initDatabase } from './db/db';
import { getProfile, META, setMeta } from './db/repo';
import { setLocale, t } from './i18n';
import { registerServiceWorker, requestPersistentStorage } from './lib/pwa';

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  try {
    await initDatabase();
    const profile = await getProfile();
    setLocale(profile.locale);
  } catch (err) {
    root.render(
      <div className="view">
        <div className="banner banner-danger" role="alert">
          {t('error.dbOpen')} ({String(err)})
        </div>
      </div>,
    );
    return;
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  requestPersistentStorage().then((state) => setMeta(META.storagePersisted, state));
  registerServiceWorker();
}

void boot();
