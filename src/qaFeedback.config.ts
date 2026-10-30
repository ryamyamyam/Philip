/**
 * Philip's configuration for the QA & Feedback Capture module (src/modules/qa-feedback).
 * This file is the only place that connects the module to Philip.
 */
import { getProfile } from './db/repo';
import { createGeminiProvider, type QaFeedbackConfig } from './modules/qa-feedback';

const TAB_NAMES: Record<string, string> = {
  today: 'Today',
  history: 'History',
  targets: 'Targets',
  settings: 'Settings',
};

export const qaFeedbackConfig: QaFeedbackConfig = {
  appId: 'philip',
  appName: 'Philip',
  appVersion: __APP_VERSION__,
  appDescription:
    'Local-first iPhone PWA for nutrition tracking. React 19 + TypeScript (strict) + Vite, plain CSS with design tokens, Dexie (IndexedDB), no backend. Read CLAUDE.md and docs/ARCHITECTURE.md first.',
  // Reuses the Gemini key and model the user already set in Settings → Photo analysis.
  ai: createGeminiProvider({
    getCredentials: async () => {
      const p = await getProfile();
      if (!p.geminiKey) return null;
      // Loaded on demand so the Gemini module stays out of the startup bundle.
      const { DEFAULT_GEMINI_MODEL, normalizeModel } = await import('./services/foodAnalysis/gemini');
      return { apiKey: p.geminiKey, model: normalizeModel(p.geminiModel ?? DEFAULT_GEMINI_MODEL) };
    },
  }),
  getContext: () => {
    const tab = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'today';
    const sheet = document.querySelector('.sheet[role="dialog"] h2')?.textContent?.trim();
    const screen = TAB_NAMES[tab] ?? tab;
    return { screen: sheet ? `${screen} › ${sheet}` : screen };
  },
};
