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

/** Story 8: how much this origin stores on the device (app cache + IndexedDB), in bytes. Null when unknown. */
export async function storageUsedBytes(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return typeof e?.usage === 'number' ? e.usage : null;
  } catch {
    return null;
  }
}

/** Bytes → "0.9 MB" (one decimal, never "0.0"). */
export function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 0.1 ? '< 0.1' : mb.toFixed(1);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
