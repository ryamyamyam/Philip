/**
 * Browser helpers: capture context, image dimensions, AI image preparation, clipboard and
 * file export. Kept apart from the data layer so unit tests run without a DOM.
 */
import type { AiImage } from './ai/provider';
import type { TechnicalContext } from './types';

/** Generic context any host gets for free; the host's getContext() adds/overrides fields. */
export function captureContext(appVersion: string | undefined, extra?: Partial<TechnicalContext>): TechnicalContext {
  const openDialog = document.querySelector('[role="dialog"]:not(.qa-panel) h2');
  const base: TechnicalContext = {
    screen: openDialog?.textContent?.trim() || null,
    route: `${location.pathname}${location.hash}` || null,
    viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
    userAgent: navigator.userAgent.slice(0, 300),
    appVersion: appVersion ?? null,
    online: navigator.onLine,
  };
  const merged = { ...base, ...Object.fromEntries(Object.entries(extra ?? {}).filter(([, v]) => v != null)) } as TechnicalContext;
  return merged;
}

export async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(blob);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close();
      return size;
    }
  } catch {
    /* fall back to <img> */
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Makes a downscaled JPEG copy for AI upload (≤1600px). The stored original is never modified.
 */
export async function prepareForAi(blob: Blob, max = 1600): Promise<AiImage> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image decode failed'));
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode failed'))), 'image/jpeg', 0.85));
    canvas.width = 0;
    canvas.height = 0;
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
      r.onerror = () => reject(r.error ?? new Error('read failed'));
      r.readAsDataURL(out);
    });
    return { base64, mimeType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Clipboard write with a legacy fallback. Returns false if both fail (caller shows manual-copy advice). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* try fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Saves a text file. Uses the share sheet where files can be shared (iPhone: Save to Files,
 * AirDrop), otherwise a normal download. Returns 'cancelled' if the user dismissed the sheet.
 */
export async function saveTextFile(name: string, text: string, mime: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([text], name, { type: mime });
  if (typeof navigator.canShare === 'function') {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return 'shared';
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export function promptFileName(appId: string, ext: 'txt' | 'md', now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${appId}-dev-prompt-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.${ext}`;
}
