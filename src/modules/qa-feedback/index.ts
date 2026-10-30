/**
 * QA & Feedback Capture — public entry point.
 * Host apps import from here only. See ./README.md for setup and porting.
 */
export { QaFeedback, openQaFeedback } from './ui/QaFeedback';
export type { QaFeedbackConfig } from './config';
export type { AiProvider, AiJsonRequest, AiJsonResult } from './ai/provider';
export { AiError } from './ai/provider';
export { createGeminiProvider, type GeminiCredentials } from './ai/gemini';
export { webSpeechProvider, type TranscriptionProvider } from './transcription';
export type { Observation, QaProject, ScreenshotAttachment, DevelopmentPrompt, TechnicalContext } from './types';
