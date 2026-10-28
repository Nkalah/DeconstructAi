export const MAX_ORIGINAL_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_HARD_FILE_SIZE = 200 * 1024 * 1024;
export const MAX_ANALYSIS_PAYLOAD_SIZE = 12 * 1024 * 1024;
export const MAX_ANALYSIS_DIMENSION = 1600;

const ACCEPTED_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface StoredOriginalPoster {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
}

function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export async function inspectImageFile(file: File): Promise<ImageDimensions> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const expectedMime = ACCEPTED_TYPES[extension];
  if (!expectedMime) {
    throw new Error('wrong-type');
  }

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const actualMime = detectImageMime(bytes);
  if (!actualMime || actualMime !== expectedMime || (file.type && file.type !== expectedMime)) {
    throw new Error('wrong-type');
  }

  if (file.size > MAX_HARD_FILE_SIZE) {
    throw new Error('too-large');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('corrupt');
  }

  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (
    dimensions.width < 1 || dimensions.height < 1 ||
    dimensions.width > 30_000 || dimensions.height > 30_000 ||
    dimensions.width * dimensions.height > 100_000_000
  ) {
    throw new Error('too-large');
  }
  return dimensions;
}

export async function createAnalysisCopy(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('corrupt');
  }

  const scale = Math.min(1, MAX_ANALYSIS_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Could not prepare an analysis copy in this browser.');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Could not encode the analysis copy.')),
      'image/jpeg',
      0.86
    );
  });

  if (blob.size > MAX_ANALYSIS_PAYLOAD_SIZE) {
    throw new Error('too-large');
  }
  return blob;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the prepared image.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read the prepared image.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

export function sanitizeFileName(fileName: string): string {
  const nameWithoutExtension = fileName.replace(/\.[^.]+$/, '');
  const sanitized = nameWithoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 80);
  return sanitized || 'Uploaded Poster';
}

export async function storeOriginalPoster(record: StoredOriginalPoster): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('poster-editor-originals', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('originals')) {
        db.createObjectStore('originals', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local poster storage.'));
  });

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('originals', 'readwrite');
    transaction.objectStore('originals').add(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save the original poster.'));
    transaction.onabort = () => reject(transaction.error || new Error('Original poster storage was interrupted.'));
  }).finally(() => database.close());
}

export async function getStoredOriginalPoster(id: string): Promise<StoredOriginalPoster | undefined> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('poster-editor-originals', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local poster storage.'));
  });

  return new Promise<StoredOriginalPoster | undefined>((resolve, reject) => {
    const transaction = database.transaction('originals', 'readonly');
    const request = transaction.objectStore('originals').get(id);
    request.onsuccess = () => resolve(request.result as StoredOriginalPoster | undefined);
    request.onerror = () => reject(request.error || new Error('Could not retrieve the original poster.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Could not retrieve the original poster.'));
    };
  });
}

export async function deleteStoredOriginalPoster(id: string): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('poster-editor-originals', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local poster storage.'));
  });

  await new Promise<void>((resolve, reject) => {
    if (!database.objectStoreNames.contains('originals')) {
      database.close();
      resolve();
      return;
    }
    const transaction = database.transaction('originals', 'readwrite');
    transaction.objectStore('originals').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not delete the stored original poster.'));
    transaction.onabort = () => reject(transaction.error || new Error('Original poster deletion was interrupted.'));
  }).finally(() => database.close());
}
