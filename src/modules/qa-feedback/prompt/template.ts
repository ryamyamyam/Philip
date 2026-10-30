/**
 * Deterministic development-prompt builder. Works with no AI at all; when a batch analysis is
 * supplied, its content is added in clearly labelled "AI-suggested" sections.
 * The output is Markdown, which also reads fine as plain text in Claude Code.
 */
import type { BatchAnalysis } from '../ai/analysis';
import { shortRef } from '../db';
import type { Observation, ScreenshotAttachment } from '../types';
import type { PromptGroup } from './grouping';

export interface PromptAppInfo {
  appName: string;
  appVersion?: string;
  appDescription?: string;
  projectName: string;
}

export interface BuildPromptInput {
  app: PromptAppInfo;
  observations: Observation[];
  groups: PromptGroup[];
  attachments: Record<string, ScreenshotAttachment[]>;
  batch?: BatchAnalysis | null;
  now?: Date;
}

const TYPE_LABEL: Record<Observation['type'], string> = {
  bug: 'Bug',
  ui: 'UI issue',
  usability: 'Usability issue',
  feature: 'Feature request',
  optimization: 'Optimization',
  other: 'Other',
};
const STATUS_LABEL: Record<Observation['status'], string> = {
  new: 'New',
  reviewed: 'Reviewed',
  planned: 'Planned',
  inProgress: 'In progress',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const MAX_ORIGINAL = 4000;

function quote(text: string): string {
  const t = text.length > MAX_ORIGINAL ? text.slice(0, MAX_ORIGINAL) + ' […truncated]' : text;
  return t
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Acceptance criteria derived only from what the user wrote. */
export function templateAcceptanceCriteria(o: Observation): string[] {
  const out: string[] = [];
  const problemTypes: Observation['type'][] = ['bug', 'ui', 'usability', 'optimization'];
  if (o.actualBehavior && problemTypes.includes(o.type)) out.push(`The reported behavior no longer occurs: ${o.actualBehavior}`);
  if (o.expectedBehavior) out.push(`Expected behavior holds: ${o.expectedBehavior}`);
  if (!o.actualBehavior && !o.expectedBehavior) {
    out.push(
      o.type === 'feature'
        ? 'The requested capability works as described in the original description.'
        : 'The issue described in the original description is resolved, confirmed by reproducing it before and after the change.',
    );
  }
  out.push('Existing functionality in the affected area keeps working (no regressions).');
  return out;
}

/** Gaps a developer will hit, derived from empty fields. Never filled with guesses. */
export function templateMissingInfo(o: Observation): string[] {
  const out: string[] = [];
  if (!o.feature) out.push('The feature/screen was not stated — locate it from the description and captured context.');
  if (o.type === 'bug' && !o.actualBehavior) out.push('Exact actual behavior and reproduction steps were not described.');
  if (!o.expectedBehavior && o.type !== 'feature') out.push('Expected behavior was not stated explicitly.');
  if (!o.originalText.trim() && !o.description) out.push('The observation has no written description; rely on the screenshots.');
  return out;
}

function observationSection(o: Observation, shots: ScreenshotAttachment[], batch: BatchAnalysis | null | undefined): string {
  const lines: string[] = [];
  lines.push(`#### ${shortRef(o.id)} · ${o.title}`);
  lines.push('');
  lines.push(
    `- Type: ${TYPE_LABEL[o.type]} · Priority: ${o.priority ? o.priority[0]!.toUpperCase() + o.priority.slice(1) : 'Not set'} · Status: ${STATUS_LABEL[o.status]}`,
  );
  lines.push(`- Feature/screen: ${o.feature || 'Not stated'}`);
  lines.push(`- Captured: ${fmtDate(o.createdAt)}${o.captureMethod === 'voice' ? ' (voice)' : ''}`);
  if (o.tags.length) lines.push(`- Tags: ${o.tags.join(', ')}`);
  lines.push('');
  lines.push("**Original description (the user's own words, verbatim):**");
  lines.push(o.originalText.trim() ? quote(o.originalText.trim()) : '> (no text — see screenshots)');
  lines.push('');

  const structured: string[] = [];
  const aiMark = (f: Observation['aiFields'][number]) => (o.aiFields.includes(f) ? ' _(AI-drafted from the user’s words, accepted by the user)_' : '');
  if (o.description) structured.push(`- Summary: ${o.description}${aiMark('description')}`);
  structured.push(`- Actual behavior: ${o.actualBehavior || 'Not stated'}${o.actualBehavior ? aiMark('actualBehavior') : ''}`);
  structured.push(`- Expected behavior: ${o.expectedBehavior || 'Not stated'}${o.expectedBehavior ? aiMark('expectedBehavior') : ''}`);
  if (o.proposedSolution) structured.push(`- User's proposed solution: ${o.proposedSolution}${aiMark('proposedSolution')}`);
  lines.push('**Structured details:**');
  lines.push(...structured);
  if (o.notes) {
    lines.push('');
    lines.push('**Notes:**');
    lines.push(quote(o.notes));
  }

  if (shots.length) {
    lines.push('');
    lines.push(`**Screenshots (${shots.length}):** stored in the QA tool, not in the repository. Attach them to this conversation if visual detail matters.`);
    shots.forEach((a, i) => {
      const dims = a.width && a.height ? `, ${a.width}×${a.height}` : '';
      lines.push(`- Screenshot ${i + 1}: ${a.fileName ?? 'unnamed'} (${a.mimeType}, ${fmtBytes(a.size)}${dims})${a.description ? ` — user note: ${a.description}` : ''}`);
      if (a.aiAnalysis) {
        const ai = a.aiAnalysis;
        lines.push(`  - AI visual description (unverified, not a user statement): ${ai.summary}`);
        if (ai.possibleIssues.length) lines.push(`  - AI-noticed possible visual issues (unverified): ${ai.possibleIssues.join('; ')}`);
        if (ai.visibleText.length) lines.push(`  - Visible text (AI-extracted): ${ai.visibleText.map((t) => `“${t}”`).join(', ')}`);
      }
    });
  }

  const ctx = o.technicalContext;
  if (ctx) {
    const parts = [
      ctx.screen && `screen: ${ctx.screen}`,
      ctx.route && `route: ${ctx.route}`,
      ctx.viewport && `viewport: ${ctx.viewport}`,
      ctx.appVersion && `app version: ${ctx.appVersion}`,
      ctx.online === false && 'offline',
      ctx.userAgent && `user agent: ${ctx.userAgent}`,
      ...Object.entries(ctx.extra ?? {}).map(([k, v]) => `${k}: ${v}`),
    ].filter(Boolean);
    if (parts.length) {
      lines.push('');
      lines.push(`**Captured context (recorded automatically):** ${parts.join(' · ')}`);
    }
  }

  const a = o.aiAnalysis;
  if (a && (a.interpretations.length || a.unknowns.length)) {
    lines.push('');
    lines.push('**AI reading of the observation (unverified):**');
    if (a.interpretations.length) lines.push(`- Interpretations (not stated by the user): ${a.interpretations.join('; ')}`);
    if (a.unknowns.length) lines.push(`- Unknowns: ${a.unknowns.join('; ')}`);
  }

  lines.push('');
  lines.push('**Acceptance criteria:**');
  for (const c of templateAcceptanceCriteria(o)) lines.push(`- [ ] ${c}`);
  const aiItem = batch?.items[o.id];
  for (const c of aiItem?.acceptanceCriteria ?? []) lines.push(`- [ ] ${c} _(AI-suggested — confirm it matches the user's intent)_`);

  const missing = [...templateMissingInfo(o), ...(aiItem?.missingInformation ?? []).map((m) => `${m} _(AI-suggested)_`)];
  if (missing.length) {
    lines.push('');
    lines.push('**Missing information — check the code or ask; do not assume:**');
    for (const m of missing) lines.push(`- ${m}`);
  }
  return lines.join('\n');
}

export function buildDevelopmentPrompt(input: BuildPromptInput): string {
  const { app, observations, groups, attachments, batch } = input;
  const byId = new Map(observations.map((o) => [o.id, o]));
  const out: string[] = [];
  const n = observations.length;

  out.push(`# Development task for ${app.appName}: ${n} QA observation${n === 1 ? '' : 's'}`);
  out.push('');
  out.push(
    `You are working in the existing ${app.appName} repository. The observations below were captured while using the app. ` +
      'Each one keeps the user’s original words; structured fields were reviewed by the user. Anything marked AI-suggested or unverified is a hint, not a fact.',
  );
  out.push('');
  out.push('## How to work');
  out.push(
    [
      '1. Inspect the repository first: read the project docs (README, CLAUDE.md, architecture notes if present) and find the code for each affected feature or screen.',
      '2. Understand the current implementation before changing it.',
      '3. For each observation, identify the likely root cause and confirm it in the code. Say so when you cannot confirm it.',
      '4. Reuse existing components, styles, utilities and patterns.',
      '5. Avoid unnecessary refactoring; keep changes focused on these observations.',
      '6. Preserve existing functionality.',
      '7. Do not add dependencies unless clearly necessary; explain any you add.',
      '8. Do not add new infrastructure (servers, databases, services).',
      '9. Implement the changes.',
      "10. Test: run the existing test suites and add or update tests for each fix, following the repository's testing conventions.",
      '11. Report what you changed, file by file, mapped to the observation references (e.g. OBS-XXXXXX).',
      '12. Report remaining limitations, observations you could not resolve, and any assumptions you made.',
    ].join('\n'),
  );
  out.push('');
  out.push('Do not invent file names, components, APIs or database structures: everything technical here is unknown until you inspect the code.');
  out.push('');
  out.push('## Application context');
  out.push(`- Application: ${app.appName}${app.appVersion ? ` (version ${app.appVersion})` : ''}`);
  out.push(`- QA project: ${app.projectName}`);
  if (app.appDescription) out.push(`- About the app: ${app.appDescription}`);
  out.push('');

  out.push('## Work items');
  out.push('');
  out.push(
    groups.length === n
      ? 'Each observation is independent. Handle them separately.'
      : 'Observations are grouped only where they appear related; the reason is given for each group. Keep each observation’s fix traceable to its reference.',
  );
  groups.forEach((g, i) => {
    out.push('');
    out.push(`### ${i + 1}. ${g.label}`);
    out.push(`Grouping: ${g.observationIds.length > 1 ? g.reason : 'Independent.'}`);
    for (const id of g.observationIds) {
      const o = byId.get(id);
      if (!o) continue;
      out.push('');
      out.push(observationSection(o, attachments[id] ?? [], batch));
    }
  });

  const related = groups.filter((g) => g.observationIds.length > 1);
  if (related.length || batch?.dependencies.length) {
    out.push('');
    out.push('## Relationships and dependencies');
    for (const g of related) out.push(`- ${g.observationIds.map((id) => shortRef(id)).join(', ')}: ${g.reason}`);
    for (const d of batch?.dependencies ?? []) out.push(`- ${d} _(AI-suggested)_`);
  }

  out.push('');
  out.push('## Testing requirements');
  out.push('- Run the full existing test suite before and after your changes; all previously passing tests must still pass.');
  out.push('- Add or update automated tests that cover each observation where practical; note any you could only verify manually.');
  out.push('- Check the affected screens at small mobile widths if the app is mobile-first.');
  out.push('');
  out.push('## Technical uncertainties');
  out.push('- File locations, component names and data structures are unknown — inspect the repository.');
  if (observations.some((o) => (attachments[o.id] ?? []).length)) out.push('- Screenshots are referenced but not included in this text; ask for them if needed.');
  for (const u of batch?.uncertainties ?? []) out.push(`- ${u} _(AI-suggested)_`);
  out.push('');
  out.push('## Report back');
  out.push('Finish with: (1) a summary per observation reference, (2) files changed, (3) tests run and their results, (4) remaining limitations or open questions.');
  out.push('');
  out.push(
    `_Generated by QA & Feedback Capture on ${fmtDate((input.now ?? new Date()).getTime())}${batch ? ` with AI assistance (${batch.provider}/${batch.model})` : ' (template, no AI)'}._`,
  );
  return out.join('\n');
}
