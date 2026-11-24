/**
 * Extracts a Google Drive FILE_ID from shared links such as:
 * - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID&export=view
 * - https://drive.google.com/thumbnail?id=FILE_ID&sz=w1600
 * - https://lh3.googleusercontent.com/d/FILE_ID
 */
export function extractGoogleDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /^([a-zA-Z0-9_-]{20,64})$/,
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function loadRemoteImageToJpegFile(url: string, fileName: string): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const maxWidth = 1200;
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
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob(
          (blob) => {
            canvas.width = 0;
            canvas.height = 0;
            if (!blob) {
              reject(new Error('Could not encode Google Drive image'));
              return;
            }
            resolve(new File([blob], fileName, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.7
        );
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load Google Drive image via cross-origin canvas'));
    };

    img.src = url;
  });
}

/**
 * Fetches a shared Google Drive image link by FILE_ID and returns a compressed JPEG File
 * ready for the app's standard photo optimization & evaluation queue.
 */
export async function fetchGoogleDriveImageAsFile(urlOrId: string): Promise<File> {
  const fileId = extractGoogleDriveFileId(urlOrId);
  if (!fileId) {
    throw new Error('INVALID_DRIVE_LINK');
  }

  const fileName = `drive_${fileId.slice(0, 10)}.jpg`;
  const candidateUrls = [
    `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
    `https://drive.google.com/uc?export=view&id=${fileId}`,
  ];

  // Strategy 1: direct CORS fetch
  for (const url of candidateUrls) {
    try {
      const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!resp.ok) continue;
      const blob = await resp.blob();
      if (blob.type.startsWith('image/') && blob.size > 100) {
        return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
      }
    } catch {
      // Try next URL / strategy
    }
  }

  // Strategy 2: crossOrigin Image -> Canvas -> compressed JPEG File
  for (const url of candidateUrls) {
    try {
      return await loadRemoteImageToJpegFile(url, fileName);
    } catch {
      // Try next URL
    }
  }

  throw new Error('DRIVE_FETCH_FAILED');
}
