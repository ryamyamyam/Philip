/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Rest-alert Worker URL (Story 6 §8.2), from the GitHub Actions variable. */
  readonly VITE_PUSH_URL?: string;
  /** Public VAPID key for rest alerts. */
  readonly VITE_PUSH_VAPID_KEY?: string;
}
