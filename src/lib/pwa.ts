/** Service worker registration and persistent-storage request. */

export function registerServiceWorker(onUpdate?: () => void): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const register = () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          sw?.addEventListener('statechange', () => {
            // A new worker activated while an older one controlled the page.
            if (sw.state === 'activated' && navigator.serviceWorker.controller) onUpdate?.();
          });
        });
      })
      .catch(() => {
        /* offline support is best-effort */
      });
  };
  // boot() is async, so the load event may already have fired.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

export type PersistState = 'granted' | 'denied' | 'unsupported';

/** Asks the browser not to evict our IndexedDB data under storage pressure. */
export async function requestPersistentStorage(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
