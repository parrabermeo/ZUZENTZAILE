import type { StoredImageAsset } from '../types';

const ARRAY_IMAGE_KEYS = [
  'pruebaImagenes',
  'enunciadoImagenes',
  'referenceImages',
  'testImages',
  'enunciadoFotos',
  'readingImages',
] as const;

const SINGLE_IMAGE_KEYS = [
  'imagenPrueba',
  'enunciadoImagen',
  'referenceImage',
  'imagenEnunciado',
  'testImage',
] as const;

function normalizeSingleImageCandidate(
  raw: unknown,
  fallbackIdPrefix: string,
  idx: number
): StoredImageAsset | null {
  if (!raw) return null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const dataUrl = trimmed.startsWith('data:')
      ? trimmed
      : trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')
        ? trimmed
        : `data:image/jpeg;base64,${trimmed}`;
    return {
      id: `${fallbackIdPrefix}-${idx}`,
      name: `Enunciado ${idx + 1}.jpg`,
      dataUrl,
    };
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    let dataUrl = '';
    if (typeof obj.dataUrl === 'string' && obj.dataUrl.trim()) {
      dataUrl = obj.dataUrl.trim();
    } else if (typeof obj.url === 'string' && obj.url.trim()) {
      dataUrl = obj.url.trim();
    } else if (typeof obj.src === 'string' && obj.src.trim()) {
      dataUrl = obj.src.trim();
    } else if (typeof obj.base64Data === 'string' && obj.base64Data.trim()) {
      const mime = typeof obj.mimeType === 'string' && obj.mimeType ? obj.mimeType : 'image/jpeg';
      const b64 = obj.base64Data.trim();
      dataUrl = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;
    } else if (typeof obj.base64 === 'string' && obj.base64.trim()) {
      const b64 = obj.base64.trim();
      dataUrl = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
    }

    if (!dataUrl) return null;
    return {
      id: typeof obj.id === 'string' && obj.id ? obj.id : `${fallbackIdPrefix}-${idx}`,
      name:
        typeof obj.name === 'string' && obj.name.trim()
          ? obj.name.trim()
          : typeof obj.fileName === 'string' && obj.fileName.trim()
            ? obj.fileName.trim()
            : `Enunciado ${idx + 1}.jpg`,
      dataUrl,
      sizeKb: typeof obj.sizeKb === 'number' ? obj.sizeKb : undefined,
    };
  }

  return null;
}

/**
 * Inspects all current and legacy schema fields on a SavedTestDefinition or EvaluationRecord
 * (`pruebaImagenes`, `enunciadoImagenes`, `imagenPrueba`, `referenceImages`, `enunciadoImagen`, `referenceImage`, etc.)
 * and returns a deduplicated list of StoredImageAsset entries.
 */
export function extractReferenceImagesFromRecord(
  record: unknown,
  fallbackIdPrefix = 'ref-recovered'
): StoredImageAsset[] {
  if (!record || typeof record !== 'object') return [];
  const rec = record as Record<string, unknown>;
  const collected: StoredImageAsset[] = [];
  const seenUrls = new Set<string>();

  const pushUnique = (asset: StoredImageAsset | null) => {
    if (!asset || !asset.dataUrl || seenUrls.has(asset.dataUrl)) return;
    seenUrls.add(asset.dataUrl);
    collected.push(asset);
  };

  for (const key of ARRAY_IMAGE_KEYS) {
    const val = rec[key];
    if (Array.isArray(val)) {
      val.forEach((entry, idx) => {
        pushUnique(normalizeSingleImageCandidate(entry, `${fallbackIdPrefix}-${key}`, idx));
      });
    } else if (val) {
      pushUnique(normalizeSingleImageCandidate(val, `${fallbackIdPrefix}-${key}`, 0));
    }
  }

  for (const key of SINGLE_IMAGE_KEYS) {
    const val = rec[key];
    if (val) {
      pushUnique(normalizeSingleImageCandidate(val, `${fallbackIdPrefix}-${key}`, collected.length));
    }
  }

  return collected;
}

export function mergeUniqueReferenceImages(
  existing: StoredImageAsset[] | undefined,
  incoming: StoredImageAsset[]
): StoredImageAsset[] {
  const result: StoredImageAsset[] = [];
  const seen = new Set<string>();

  for (const item of [...(existing || []), ...incoming]) {
    if (!item?.dataUrl || seen.has(item.dataUrl)) continue;
    seen.add(item.dataUrl);
    result.push(item);
  }
  return result;
}
