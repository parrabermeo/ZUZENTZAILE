export interface OptimizedJpegResult {
  base64Data: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  sizeKb: number;
  dataUrl: string;
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`No se pudo cargar la imagen "${file.name}".`));
    };
    img.src = url;
  });
}

/**
 * Optimizes any image via an offscreen <canvas>:
 * - Caps width at maxWidth (default 1200px) preserving aspect ratio (never upscales)
 * - Fills white background (so PNG transparency renders cleanly as JPEG)
 * - Encodes as JPEG with quality 0.70 (crisp text & handwriting, safe for Firestore 1MB doc limit)
 */
export async function optimizeJpegForGemini(
  file: File,
  options: { maxWidth?: number; quality?: number } = {}
): Promise<OptimizedJpegResult> {
  const maxWidth = options.maxWidth ?? 1200;
  const quality = options.quality ?? 0.7;

  const img = await loadHtmlImage(file);
  const naturalW = Math.max(1, img.naturalWidth || img.width);
  const naturalH = Math.max(1, img.naturalHeight || img.height);

  const scale = naturalW > maxWidth ? maxWidth / naturalW : 1;
  const targetW = Math.max(1, Math.round(naturalW * scale));
  const targetH = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context for JPEG optimization.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const commaIdx = dataUrl.indexOf(',');
  const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const approxBytes = Math.round((base64Data.length * 3) / 4);

  // Release canvas memory immediately
  canvas.width = 0;
  canvas.height = 0;

  return {
    base64Data,
    mimeType: 'image/jpeg',
    width: targetW,
    height: targetH,
    sizeKb: Math.max(1, Math.round(approxBytes / 1024)),
    dataUrl,
  };
}

/**
 * Generates an archival compressed JPEG via <canvas> (default maxWidth 1200px, quality 0.70)
 * safe for individual Firestore documents (< 1 MB) and IndexedDB.
 */
export async function optimizeImageForStorage(
  file: File,
  options: { maxWidth?: number; quality?: number } = {}
): Promise<{ dataUrl: string; sizeKb: number }> {
  const res = await optimizeJpegForGemini(file, {
    maxWidth: options.maxWidth ?? 1200,
    quality: options.quality ?? 0.7,
  });
  return {
    dataUrl: res.dataUrl,
    sizeKb: res.sizeKb,
  };
}
