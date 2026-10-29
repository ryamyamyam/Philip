/** Browser-side image preparation: downscale + JPEG re-encode before upload. */

export const MAX_DIMENSION = 1024; // enough detail to identify food; keeps uploads ~100–250 KB
export const JPEG_QUALITY = 0.82;

export interface PreparedImage {
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
}

export function fitWithin(w: number, h: number, max = MAX_DIMENSION): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const k = max / Math.max(w, h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image decode failed'));
    };
    img.src = url;
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

/** Browsers apply EXIF orientation when drawing <img> (image-orientation: from-image is the default). */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const img = await loadImage(file);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode failed'))), 'image/jpeg', JPEG_QUALITY),
  );
  // Release canvas memory early (iOS has tight canvas limits).
  canvas.width = 0;
  canvas.height = 0;
  return { base64: await blobToBase64(blob), mimeType: 'image/jpeg', width, height, bytes: blob.size };
}
