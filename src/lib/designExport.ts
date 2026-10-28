import { jsPDF } from 'jspdf';
import type { SceneGraph } from '../types/sceneGraph';
import { renderSceneToSvgString } from './sceneSvgRenderer';

export type ExportFormat = 'png' | 'jpg' | 'pdf' | 'svg';
export type ExportResolution = '1x' | '2x' | '3x' | '150dpi' | '300dpi';
export type ExportPresetId =
  | 'original'
  | 'a4'
  | 'a5'
  | 'instagram-post'
  | 'instagram-story'
  | 'whatsapp-status';

interface ExportPreset {
  id: ExportPresetId;
  label: string;
  width: number;
  height: number;
  physicalWidthMm?: number;
  physicalHeightMm?: number;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'original', label: 'Original design', width: 0, height: 0 },
  { id: 'a4', label: 'A4 print', width: 0, height: 0, physicalWidthMm: 210, physicalHeightMm: 297 },
  { id: 'a5', label: 'A5 print', width: 0, height: 0, physicalWidthMm: 148, physicalHeightMm: 210 },
  { id: 'instagram-post', label: 'Instagram post', width: 1080, height: 1080 },
  { id: 'instagram-story', label: 'Instagram Story', width: 1080, height: 1920 },
  { id: 'whatsapp-status', label: 'WhatsApp status', width: 1080, height: 1920 }
];

export interface ExportOptions {
  format: ExportFormat;
  preset: ExportPresetId;
  resolution: ExportResolution;
  transparent: boolean;
}

export interface ExportDimensions {
  width: number;
  height: number;
  dpi: number | null;
  physicalWidthMm: number;
  physicalHeightMm: number;
}

const DPI_SCALE = 96;
const MAX_EXPORT_PIXELS = 100_000_000;
const MAX_EXPORT_EDGE = 30_000;

function scaleForResolution(resolution: ExportResolution): number {
  switch (resolution) {
    case '1x': return 1;
    case '2x': return 2;
    case '3x': return 3;
    case '150dpi': return 150;
    case '300dpi': return 300;
  }
}

export function getExportDimensions(
  scene: SceneGraph,
  presetId: ExportPresetId,
  resolution: ExportResolution
): ExportDimensions {
  const preset = EXPORT_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Unknown export size "${presetId}".`);
  if (preset.physicalWidthMm && preset.physicalHeightMm) {
    if (resolution !== '150dpi' && resolution !== '300dpi') {
      throw new Error('Choose 150 DPI or 300 DPI for print sizes.');
    }
    const dpi = scaleForResolution(resolution);
    return {
      width: Math.round((preset.physicalWidthMm / 25.4) * dpi),
      height: Math.round((preset.physicalHeightMm / 25.4) * dpi),
      dpi,
      physicalWidthMm: preset.physicalWidthMm,
      physicalHeightMm: preset.physicalHeightMm
    };
  }

  if (resolution === '150dpi' || resolution === '300dpi') {
    throw new Error('Print DPI is available for A4 and A5 sizes.');
  }
  const scale = scaleForResolution(resolution);
  const baseWidth = preset.id === 'original' ? scene.canvas.width : preset.width;
  const baseHeight = preset.id === 'original' ? scene.canvas.height : preset.height;
  const width = Math.round(baseWidth * scale);
  const height = Math.round(baseHeight * scale);
  return {
    width,
    height,
    dpi: null,
    physicalWidthMm: (width / DPI_SCALE) * 25.4,
    physicalHeightMm: (height / DPI_SCALE) * 25.4
  };
}

export function buildExportScene(
  scene: SceneGraph,
  dimensions: ExportDimensions,
  transparent: boolean
): SceneGraph {
  const scale = Math.min(dimensions.width / scene.canvas.width, dimensions.height / scene.canvas.height);
  const offsetX = (dimensions.width - scene.canvas.width * scale) / 2;
  const offsetY = (dimensions.height - scene.canvas.height * scale) / 2;
  const layers = scene.layers
    .filter((layer) => !transparent || layer.type !== 'background_fill')
    .map((layer) => {
      const scaled = structuredClone(layer);
      scaled.transform.x = scaled.transform.x * scale + offsetX;
      scaled.transform.y = scaled.transform.y * scale + offsetY;
      scaled.transform.width *= scale;
      scaled.transform.height *= scale;
      if (scaled.type === 'text') {
        scaled.type_specific.font_size *= scale;
        if (scaled.type_specific.letter_spacing !== undefined) scaled.type_specific.letter_spacing *= scale;
      }
      if (scaled.style.effects) {
        scaled.style.effects.shadow.offset_x *= scale;
        scaled.style.effects.shadow.offset_y *= scale;
        scaled.style.effects.shadow.blur *= scale;
        scaled.style.effects.stroke.width *= scale;
        if (scaled.style.effects.gradient) {
          scaled.style.effects.gradient.stops = scaled.style.effects.gradient.stops.map((stop) => ({ ...stop }));
        }
      }
      return scaled;
    });

  return {
    ...structuredClone(scene),
    canvas: {
      ...scene.canvas,
      width: dimensions.width,
      height: dimensions.height,
      background_color: transparent ? null : scene.canvas.background_color
    },
    layers
  };
}

const SAFE_VECTOR_ICONS = new Set(['qr-code', 'map-pin', 'calendar', 'heart', 'star']);

export function getRasterLimitations(scene: SceneGraph): string[] {
  const reasons = new Set<string>();
  for (const layer of scene.layers.filter((item) => item.visible !== false)) {
    if (layer.style.blend_mode && layer.style.blend_mode !== 'normal') {
      reasons.add(`Layer "${layer.name}" uses a blend mode not supported by the export renderer.`);
    }
    if (layer.type === 'image') {
      if (!layer.type_specific.image_url) reasons.add(`Image layer "${layer.name}" has no image data.`);
      if (layer.type_specific.mask_shape === 'custom_path') {
        reasons.add(`Image layer "${layer.name}" uses a custom mask with no exportable path data.`);
      }
    } else if (layer.type === 'icon' && !layer.type_specific.image_url
      && !SAFE_VECTOR_ICONS.has(layer.type_specific.icon_name)) {
      reasons.add(`Icon "${layer.type_specific.icon_name}" in "${layer.name}" has no supported export path.`);
    } else if (layer.type === 'shape'
      && !['rect', 'ellipse', 'pill'].includes(layer.type_specific.shape_type)) {
      reasons.add(`Shape "${layer.name}" uses geometry not supported by the export renderer.`);
    } else if (layer.type === 'background_fill'
      && layer.type_specific.fill_type === 'reconstructed_texture'
      && !layer.type_specific.reconstructed_image_url) {
      reasons.add(`Background "${layer.name}" has no renderable texture image.`);
    } else if (layer.type === 'text' && layer.type_specific.alignment === 'justify') {
      reasons.add(`Text layer "${layer.name}" uses justified alignment not supported by the export renderer.`);
    }
  }
  return [...reasons];
}

export function getSvgLimitations(scene: SceneGraph): string[] {
  const reasons = new Set(getRasterLimitations(scene));
  for (const layer of scene.layers.filter((item) => item.visible !== false)) {
    if (layer.style.blend_mode && layer.style.blend_mode !== 'normal') {
      reasons.add(`Layer "${layer.name}" uses a blend mode that SVG export cannot preserve.`);
    }
    if (layer.type === 'image') {
      reasons.add(`Layer "${layer.name}" contains a raster image, so the design is not vector-only.`);
    } else if (layer.type === 'icon') {
      if (layer.type_specific.image_url) {
        reasons.add(`Layer "${layer.name}" contains a raster image, so the design is not vector-only.`);
      } else if (!SAFE_VECTOR_ICONS.has(layer.type_specific.icon_name)) {
        reasons.add(`Icon "${layer.type_specific.icon_name}" in "${layer.name}" has no supported vector path.`);
      }
    } else if (layer.type === 'shape'
      && !['rect', 'ellipse', 'pill'].includes(layer.type_specific.shape_type)) {
      reasons.add(`Shape "${layer.name}" uses geometry not supported by the SVG exporter.`);
    } else if (layer.type === 'background_fill'
      && layer.type_specific.fill_type === 'reconstructed_texture') {
      reasons.add(`Background "${layer.name}" is a raster texture, not vector artwork.`);
    }
  }
  return [...reasons];
}

export function validateExportDimensions(dimensions: ExportDimensions): void {
  if (!Number.isSafeInteger(dimensions.width) || !Number.isSafeInteger(dimensions.height)
    || dimensions.width < 1 || dimensions.height < 1) {
    throw new Error('The selected export size is invalid.');
  }
  if (dimensions.width > MAX_EXPORT_EDGE || dimensions.height > MAX_EXPORT_EDGE
    || dimensions.width * dimensions.height > MAX_EXPORT_PIXELS) {
    throw new Error('The selected export resolution is too large for this browser. Choose a smaller size or lower DPI.');
  }
}

function waitForImage(image: HTMLImageElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('An image or font resource could not be rendered. Check that design images are available, then retry the export.'));
    image.src = url;
  });
}

async function renderToCanvas(
  svg: string,
  dimensions: ExportDimensions,
  flatten: boolean,
  scene: SceneGraph
): Promise<HTMLCanvasElement> {
  if ('fonts' in document && document.fonts?.ready) {
    await document.fonts.ready;
    const fontFaces = new Set(scene.layers.flatMap((layer) => {
      if (layer.visible === false || layer.type !== 'text') return [];
        const family = layer.type_specific.font_family.replace(/["\\]/g, '\\$&');
      return [`${layer.type_specific.font_weight} ${layer.type_specific.font_size}px "${family}"`];
    }));
    await Promise.all(Array.from(fontFaces, (font) => document.fonts.load(font)));
  }
  await validateImageResources(scene);
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await waitForImage(image, svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { alpha: !flatten });
    if (!context) throw new Error('This browser could not create an export canvas. Try another browser or lower the export resolution.');
    if (flatten) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

async function validateImageResources(scene: SceneGraph): Promise<void> {
  const imageUrls = scene.layers.flatMap((layer) => {
    if (layer.visible === false) return [];
    if (layer.type === 'image') return [layer.type_specific.image_url];
    if (layer.type === 'icon' && layer.type_specific.image_url) return [layer.type_specific.image_url];
    if (layer.type === 'background_fill'
      && layer.type_specific.fill_type === 'reconstructed_texture'
      && layer.type_specific.reconstructed_image_url) return [layer.type_specific.reconstructed_image_url];
    return [];
  });
  await Promise.all(imageUrls.map(async (src) => {
    if (!src) throw new Error('A visible image layer has no image data. Restore the image and retry the export.');
    const image = new Image();
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    try {
      image.src = src;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image has no drawable pixels.');
    } catch {
      throw new Error('A design image could not be loaded for export. Check that it is available and retry.');
    }
  }));
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The browser could not encode the export. Try a lower resolution and retry.'));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

export async function createExportBlob(
  scene: SceneGraph,
  options: ExportOptions
): Promise<{ blob: Blob; filenameSuffix: string }> {
  const dimensions = getExportDimensions(scene, options.preset, options.resolution);
  validateExportDimensions(dimensions);
  const exportScene = buildExportScene(scene, dimensions, options.format === 'png' && options.transparent);
  const rasterLimitations = getRasterLimitations(exportScene);
  if (options.format !== 'svg' && rasterLimitations.length) {
    throw new Error(`This design contains layers the export renderer cannot reproduce safely: ${rasterLimitations.join(' ')}`);
  }
  const svg = renderSceneToSvgString(exportScene);
  const sizeSuffix = `${dimensions.width}x${dimensions.height}`;

  if (options.format === 'svg') {
    const limitations = getSvgLimitations(exportScene);
    if (limitations.length) throw new Error(`SVG is unavailable for this design: ${limitations.join(' ')}`);
    return {
      blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      filenameSuffix: 'svg'
    };
  }

  const canvas = await renderToCanvas(
    svg,
    dimensions,
    options.format === 'jpg' || options.format === 'pdf',
    exportScene
  );
  if (options.format === 'png') {
    return { blob: await canvasToBlob(canvas, 'image/png'), filenameSuffix: `${sizeSuffix}.png` };
  }
  if (options.format === 'jpg') {
    return { blob: await canvasToBlob(canvas, 'image/jpeg', 0.95), filenameSuffix: `${sizeSuffix}.jpg` };
  }

  const pdf = new jsPDF({
    orientation: dimensions.width > dimensions.height ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [dimensions.physicalWidthMm, dimensions.physicalHeightMm],
    compress: true
  });
  const jpegData = await canvasToBlob(canvas, 'image/jpeg', 0.95);
  const dataUrl = await blobToDataUrl(jpegData);
  pdf.addImage(dataUrl, 'JPEG', 0, 0, dimensions.physicalWidthMm, dimensions.physicalHeightMm);
  return { blob: pdf.output('blob'), filenameSuffix: `${sizeSuffix}.pdf` };
}

export function renderExportPreview(scene: SceneGraph, options: ExportOptions): string {
  const dimensions = getExportDimensions(scene, options.preset, options.resolution);
  const exportScene = buildExportScene(scene, dimensions, options.format === 'png' && options.transparent);
  const multiplier = Math.min(480 / dimensions.width, 480 / dimensions.height);
  const svg = renderSceneToSvgString(exportScene, multiplier);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Could not prepare the PDF image data.'));
    reader.onerror = () => reject(new Error('Could not prepare the PDF image data.'));
    reader.readAsDataURL(blob);
  });
}
