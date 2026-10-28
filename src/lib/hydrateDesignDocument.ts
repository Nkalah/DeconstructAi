import type { DesignDocument, ImageDesignLayer, TextDesignLayer } from '../core/schema/designDocument';
import { getStoredOriginalPoster } from './posterUpload';

function colorFromPixels(bitmap: ImageBitmap, x: number, y: number, width: number, height: number): string {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const sampleContext = canvas.getContext('2d', { willReadFrequently: true });
  if (!sampleContext) return '#111111';
  sampleContext.drawImage(bitmap, x, y, width, height, 0, 0, size, size);
  const { data } = sampleContext.getImageData(0, 0, size, size);
  const backgroundSamples: number[][] = [];
  for (const [px, py] of [[1, 1], [size - 2, 1], [1, size - 2], [size - 2, size - 2]]) {
    const index = (py * size + px) * 4;
    backgroundSamples.push([data[index], data[index + 1], data[index + 2]]);
  }
  const background = [0, 1, 2].map((channel) =>
    Math.round(backgroundSamples.reduce((sum, pixel) => sum + pixel[channel], 0) / backgroundSamples.length)
  );
  const counts = new Map<string, { count: number; red: number; green: number; blue: number }>();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 200) continue;
    const pixel = [data[index], data[index + 1], data[index + 2]];
    const distance = Math.hypot(
      pixel[0] - background[0],
      pixel[1] - background[1],
      pixel[2] - background[2]
    );
    if (distance < 36) continue;
    const key = pixel.map((value) => Math.round(value / 16) * 16).join(',');
    const current = counts.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    current.count += 1;
    current.red += pixel[0];
    current.green += pixel[1];
    current.blue += pixel[2];
    counts.set(key, current);
  }
  const dominant = [...counts.values()].sort((left, right) => right.count - left.count)[0];
  if (!dominant) return '#111111';
  return `#${[dominant.red, dominant.green, dominant.blue]
    .map((value) => Math.round(value / dominant.count).toString(16).padStart(2, '0'))
    .join('')}`;
}

function createCrop(
  bitmap: ImageBitmap,
  source: { x: number; y: number; width: number; height: number }
): string {
  const x = Math.max(0, Math.floor(source.x));
  const y = Math.max(0, Math.floor(source.y));
  const right = Math.min(bitmap.width, Math.ceil(source.x + source.width));
  const bottom = Math.min(bitmap.height, Math.ceil(source.y + source.height));
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare an original-resolution image crop.');
  context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.94);
}

async function createMaskedCrop(
  bitmap: ImageBitmap,
  source: { x: number; y: number; width: number; height: number },
  maskUri: string
): Promise<string> {
  const response = await fetch(maskUri);
  if (!response.ok) throw new Error('Could not read the foreground mask.');
  const mask = await createImageBitmap(await response.blob());
  try {
    const x = Math.max(0, Math.floor(source.x));
    const y = Math.max(0, Math.floor(source.y));
    const right = Math.min(bitmap.width, Math.ceil(source.x + source.width));
    const bottom = Math.min(bitmap.height, Math.ceil(source.y + source.height));
    const width = Math.max(1, right - x);
    const height = Math.max(1, bottom - y);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not apply the foreground mask.');
    context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
    const originalPixels = context.getImageData(0, 0, width, height);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskContext) throw new Error('Could not read the foreground mask pixels.');
    if (mask.width === bitmap.width && mask.height === bitmap.height) {
      maskContext.drawImage(mask, x, y, width, height, 0, 0, width, height);
    } else {
      maskContext.drawImage(mask, 0, 0, width, height);
    }
    const maskPixels = maskContext.getImageData(0, 0, width, height);
    const samples = [
      0,
      (width - 1) * 4,
      (height - 1) * width * 4,
      (height * width - 1) * 4
    ];
    const cornerLuminance = samples.reduce((sum, index) =>
      sum + (maskPixels.data[index] * 0.299 + maskPixels.data[index + 1] * 0.587 + maskPixels.data[index + 2] * 0.114), 0
    ) / samples.length;
    const invertMask = cornerLuminance > 127;
    for (let index = 0; index < originalPixels.data.length; index += 4) {
      const luminance = maskPixels.data[index] * 0.299
        + maskPixels.data[index + 1] * 0.587
        + maskPixels.data[index + 2] * 0.114;
      const foreground = invertMask ? 255 - luminance : luminance;
      originalPixels.data[index + 3] = Math.round(originalPixels.data[index + 3] * foreground / 255);
    }
    context.putImageData(originalPixels, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    mask.close();
  }
}

export async function hydrateDesignDocumentFromOriginal(
  document: DesignDocument,
  originalAssetId: string
): Promise<DesignDocument> {
  const original = await getStoredOriginalPoster(originalAssetId);
  if (!original) throw new Error('The full-resolution original poster could not be found in local storage.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(original.blob);
  } catch {
    throw new Error('The full-resolution original poster could not be decoded for reconstruction.');
  }

  const objectUrl = URL.createObjectURL(original.blob);
  const updated = structuredClone(document);
  const originalAsset = updated.assets[originalAssetId];
  if (originalAsset) originalAsset.uri = objectUrl;
  const fallbackAssetId = Object.keys(updated.assets).find((id) => id.startsWith('original-') && id !== originalAssetId);
  const cleanBackgroundId = `clean-background-${updated.id}`;
  const cleanBackground = updated.assets[cleanBackgroundId];
  if (fallbackAssetId && !cleanBackground) updated.assets[fallbackAssetId].uri = objectUrl;

  if (cleanBackground) {
    try {
      const response = await fetch(cleanBackground.uri);
      if (!response.ok) throw new Error('Could not read the reconstructed background.');
      const cleanBitmap = await createImageBitmap(await response.blob());
      try {
        const aspectDifference = Math.abs(cleanBitmap.width / cleanBitmap.height - bitmap.width / bitmap.height);
        if (aspectDifference > 0.05) {
          throw new Error('The reconstructed background dimensions do not match the poster.');
        }
      } finally {
        cleanBitmap.close();
      }
    } catch (error) {
      console.error('Could not verify the reconstructed background:', error);
      if (fallbackAssetId) updated.assets[fallbackAssetId].uri = objectUrl;
      updated.layers = updated.layers.filter((layer) => layer.source.origin === 'fallback');
      if (fallbackAssetId) {
        for (const layer of updated.layers) {
          if (layer.type === 'image' && layer.assetId === cleanBackgroundId) layer.assetId = fallbackAssetId;
        }
      }
      delete updated.assets[cleanBackgroundId];
      updated.analysis.status = 'partial';
      updated.analysis.warnings.push('Background verification failed; editable overlays were withheld and the original poster remains raster-only.');
      const reconstructionStage = updated.analysis.stages.find((stage) => stage.name === 'background reconstruction');
      if (reconstructionStage) {
        reconstructionStage.status = 'failed';
        reconstructionStage.message = 'Client-side dimensions did not verify; editable overlays were withheld.';
      }
    }
  }

  try {
    for (const layer of updated.layers) {
      if (layer.type === 'text') {
        const textLayer = layer as TextDesignLayer;
        const x = Math.max(0, Math.floor(textLayer.x));
        const y = Math.max(0, Math.floor(textLayer.y));
        const width = Math.max(1, Math.min(bitmap.width - x, Math.ceil(textLayer.width)));
        const height = Math.max(1, Math.min(bitmap.height - y, Math.ceil(textLayer.height)));
        textLayer.fill = colorFromPixels(bitmap, x, y, width, height);
      } else if ((layer.type === 'image' && layer.source.origin === 'detector') || layer.type === 'qr') {
        const assetId = `original-crop-${layer.id}`;
        let uri: string;
        let isolated = false;
        if (layer.type === 'image' && layer.segmentationMaskAssetId) {
          const maskUri = updated.assets[layer.segmentationMaskAssetId]?.uri;
          try {
            if (!maskUri) throw new Error(`Foreground mask for ${layer.name} is missing.`);
            uri = await createMaskedCrop(bitmap, layer, maskUri);
            isolated = true;
          } catch (error) {
            console.error(`Could not apply the foreground mask for ${layer.name}:`, error);
            uri = createCrop(bitmap, layer);
            updated.analysis.warnings.push(`${layer.name} could not be isolated; it remains a rectangular raster crop.`);
          }
        } else {
          uri = createCrop(bitmap, layer);
        }
        updated.assets[assetId] = {
          id: assetId,
          mimeType: isolated ? 'image/png' : 'image/jpeg',
          uri,
          name: `${layer.name} (${isolated ? 'isolated foreground' : 'original crop'})`
        };
        if (layer.type === 'image') {
          const imageLayer = layer as ImageDesignLayer;
          imageLayer.assetId = assetId;
          imageLayer.backgroundRemoved = isolated;
          imageLayer.originalCropAssetId = isolated ? null : assetId;
          imageLayer.source.originalCropAssetId = assetId;
          imageLayer.locked = !isolated;
          if (isolated) {
            imageLayer.source.warning_flags = imageLayer.source.warning_flags?.filter((flag) => flag !== 'foreground_not_isolated');
            if (!imageLayer.source.warning_flags?.length) delete imageLayer.source.warning_flags;
          } else {
            imageLayer.source.warning_flags = ['foreground_not_isolated'];
          }
          imageLayer.crop = null;
        } else {
          layer.assetId = assetId;
        }
      }
    }

    return updated;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  } finally {
    bitmap.close();
  }
}
