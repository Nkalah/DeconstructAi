import { createHash } from 'node:crypto';
import {
  createEmptyDocument,
  validateDocument,
  type DesignDocument,
  type DesignLayer,
  type GroupDesignLayer,
  type ImageDesignLayer,
  type QrDesignLayer,
  type ShapeDesignLayer,
  type TextDesignLayer
} from '../../src/core/schema/designDocument.js';
import { createGeminiProviders } from './geminiProviders.js';
import { matchFontCandidates, matchFontCandidatesSafely, type FontMatchStyle } from '../../src/lib/fontCatalog.js';
import type { FontCandidate } from '../../src/types/sceneGraph.js';
import type {
  AnalysisImage,
  AnalysisProgress,
  AnalysisStageName,
  AnalysisStageReport,
  AnalysisProviders,
  BackgroundReconstructionResult,
  ColorResult,
  OcrResult,
  ProviderContext,
  ProviderResult,
  QrCodeResult,
  ReconstructionRegion,
  SegmentationResult,
  VisionResult
} from './types.js';

export interface RunModularAnalysisOptions {
  image: AnalysisImage;
  designId: string;
  designName: string;
  originalAssetId?: string;
  providers?: AnalysisProviders;
  fontMatcher?: (style: FontMatchStyle) => {
    topFont: string;
    confidence: number;
    candidates: FontCandidate[];
    isApproximate: boolean;
  };
  signal?: AbortSignal;
  onProgress?: (progress: AnalysisProgress) => void;
}

export interface ModularAnalysisResult {
  document: DesignDocument;
  imageHash: string;
  stageReport: AnalysisStageReport[];
  status: AnalysisProgress['status'];
}

interface CachedProviderResults {
  ocr?: OcrResult;
  vision?: VisionResult;
  colors?: ColorResult;
  qr?: QrCodeResult[];
  segmentation?: SegmentationResult[];
  segmentationAttempted?: boolean;
  background?: BackgroundReconstructionResult;
  backgroundVerified?: boolean;
  availability: Partial<Record<'ocr' | 'vision' | 'colors' | 'qr' | 'segmentation' | 'background', string>>;
}

const stageNames: AnalysisStageName[] = [
  'validate', 'normalize', 'OCR', 'regions', 'colors', 'shapes/lines',
  'QR', 'background reconstruction', 'grouping', 'layer ordering', 'reconstruct', 'confidence scoring'
];
const resultCache = new Map<string, CachedProviderResults>();
const MAX_CACHE_ENTRIES = 100;

function safeName(value: string): string {
  const name = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return name || 'Uploaded Poster';
}

function getImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function stageMetrics(stage: AnalysisStageReport, metrics: AnalysisStageReport['metrics']): void {
  stage.metrics = metrics;
}

function publish(
  progress: AnalysisProgress,
  onProgress?: (progress: AnalysisProgress) => void
): void {
  onProgress?.(structuredClone(progress));
}

function normalizedBox(box: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const x = Math.max(0, Math.min(width, box.x * width));
  const y = Math.max(0, Math.min(height, box.y * height));
  return {
    x,
    y,
    width: Math.max(0, Math.min(width - x, box.width * width)),
    height: Math.max(0, Math.min(height - y, box.height * height))
  };
}

function baseLayer(id: string, name: string, type: string, box: ReturnType<typeof normalizedBox>, zIndex: number, confidence: number | null, origin: 'ocr' | 'detector' | 'fallback') {
  return {
    id,
    type,
    name,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    visible: true,
    source: { origin, originalBBox: box },
    confidence,
    needsReview: confidence === null || confidence < 0.75
  };
}

function colorOr(value: string | null | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function isMaskDataUri(value: string | undefined): value is string {
  if (typeof value !== 'string') return false;
  const png = value.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (png) {
    const bytes = Buffer.from(png[1], 'base64');
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  }
  const svg = value.match(/^data:image\/svg\+xml;charset=utf-8,(.+)$/);
  if (!svg) return false;
  try {
    const markup = decodeURIComponent(svg[1]);
    return /^<svg\b/.test(markup) && /<polygon\b[^>]*\bpoints="[\d.,\s-]+"/.test(markup) && /<\/svg>$/.test(markup);
  } catch {
    return false;
  }
}

function overlaps(left: ReconstructionRegion['box'], right: ReconstructionRegion['box'], threshold = 0.12): boolean {
  const intersectionWidth = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const intersectionHeight = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = intersectionWidth * intersectionHeight;
  const union = left.width * left.height + right.width * right.height - intersection;
  return union > 0 && intersection / union >= threshold;
}

function reconstructionRegions(
  ocr: OcrResult | undefined,
  vision: VisionResult | undefined,
  qrCodes: QrCodeResult[] | undefined
): ReconstructionRegion[] {
  const padded = (box: ReconstructionRegion['box']) => {
    const padX = box.width * 0.04;
    const padY = box.height * 0.08;
    const x = Math.max(0, box.x - padX);
    const y = Math.max(0, box.y - padY);
    return {
      x,
      y,
      width: Math.min(1 - x, box.width + padX * 2),
      height: Math.min(1 - y, box.height + padY * 2)
    };
  };
  return [
    ...(ocr?.blocks ?? []).filter((block) => block.text.trim()).map((block) => ({
      label: block.text.slice(0, 120),
      kind: 'text' as const,
      box: padded(block.box)
    })),
    ...(vision?.regions ?? []).map((region) => ({
      label: region.label,
      kind: 'image' as const,
      box: padded(region.box)
    })),
    ...(vision?.shapes ?? []).map((shape) => ({
      label: shape.label,
      kind: 'shape' as const,
      box: padded(shape.box)
    })),
    ...(qrCodes ?? []).map((qr, index) => ({
      label: `QR code ${index + 1}`,
      kind: 'qr' as const,
      box: padded(qr.box)
    }))
  ];
}

function verifyReconstructedBackground(
  originalRegions: ReconstructionRegion[],
  cleanedOcr: OcrResult | undefined,
  cleanedVision: VisionResult | undefined,
  cleanedQr: QrCodeResult[] | undefined
): string | null {
  const textBoxes = originalRegions.filter((region) => region.kind === 'text');
  if (textBoxes.length && !cleanedOcr) return 'OCR verification was unavailable.';
  for (const source of textBoxes) {
    if ((cleanedOcr?.blocks ?? []).some((block) => overlaps(source.box, block.box, 0.08))) {
      return `Text may remain in the reconstructed background near "${source.label}".`;
    }
  }
  const objectBoxes = originalRegions.filter((region) => region.kind === 'image');
  if (objectBoxes.length && !cleanedVision) return 'Object verification was unavailable.';
  for (const source of objectBoxes) {
    if ((cleanedVision?.regions ?? []).some((region) => overlaps(source.box, region.box, 0.12))) {
      return `An image object may remain in the reconstructed background near "${source.label}".`;
    }
  }
  const shapeBoxes = originalRegions.filter((region) => region.kind === 'shape');
  if (shapeBoxes.length && !cleanedVision) return 'Shape verification was unavailable.';
  for (const source of shapeBoxes) {
    if ((cleanedVision?.shapes ?? []).some((shape) => overlaps(source.box, shape.box, 0.12))) {
      return `A decorative shape may remain in the reconstructed background near "${source.label}".`;
    }
  }
  const qrBoxes = originalRegions.filter((region) => region.kind === 'qr');
  if (qrBoxes.length && !cleanedQr) return 'QR verification was unavailable.';
  for (const source of qrBoxes) {
    if ((cleanedQr ?? []).some((qr) => overlaps(source.box, qr.box, 0.12))) {
      return `A QR code may remain in the reconstructed background near "${source.label}".`;
    }
  }
  return null;
}

function meaningfulTextName(text: string, box: ReturnType<typeof normalizedBox>, canvasHeight: number): string {
  const normalized = text.trim();
  if (!normalized) return 'Unreadable text';
  if (/@/.test(normalized)) return 'Email address';
  if (/(?:\+?\d[\d\s().-]{6,}\d)/.test(normalized)) return 'Phone number';
  if (/\b(?:https?:\/\/|www\.)/i.test(normalized)) return 'Website';
  if (/\b(?:book|call|visit|shop|register|join|order|contact|sign up)\b/i.test(normalized)) return 'Call to action';
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun)\b|\b\d{1,2}[/-]\d{1,2}\b/i.test(normalized)) return 'Date and time';
  if (box.y < canvasHeight * 0.28 || box.height > canvasHeight * 0.07) return 'Heading';
  return normalized.length <= 30 ? normalized : `${normalized.slice(0, 27).trim()}…`;
}

function textWithLineBreaks(text: string, offsets: number[]): string {
  if (!text || !offsets.length) return text;
  let result = text;
  for (const offset of [...new Set(offsets)].filter(Number.isInteger).sort((left, right) => right - left)) {
    if (offset > 0 && offset < result.length && result[offset - 1] !== '\n' && result[offset] !== '\n') {
      result = `${result.slice(0, offset)}\n${result.slice(offset)}`;
    }
  }
  return result;
}

function classifyRegion(text: string, y: number, height: number): string {
  if (/@|(?:\+?\d[\d\s().-]{6,}\d)|\b(?:www\.|https?:\/\/)\b/i.test(text)) return 'contact';
  if (/\b(?:service|services|menu|offer|includes|features|price|pricing|package)\b/i.test(text)) return 'services';
  if (y < height * 0.22) return 'header';
  if (y > height * 0.78) return 'footer';
  return 'main';
}

function estimateZOrder(layers: DesignLayer[]): void {
  const visualRank = (layer: DesignLayer): number => {
    if (layer.source.origin === 'fallback' || layer.name === 'Background' || layer.name === 'Original poster background') return -1000;
    if (layer.type === 'image') return 100;
    if (layer.type === 'shape') return 300;
    if (layer.type === 'text') return 500;
    if (layer.type === 'qr') return 700;
    return -1;
  };
  const ordered = layers.filter((layer) => layer.type !== 'group').sort((left, right) => {
    const leftRank = visualRank(left);
    const rightRank = visualRank(right);
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftArea = left.width * left.height;
    const rightArea = right.width * right.height;
    const contains = (outer: DesignLayer, inner: DesignLayer) =>
      outer.x <= inner.x && outer.y <= inner.y &&
      outer.x + outer.width >= inner.x + inner.width &&
      outer.y + outer.height >= inner.y + inner.height;
    if (contains(left, right) && !contains(right, left)) return -1;
    if (contains(right, left) && !contains(left, right)) return 1;
    return rightArea - leftArea || left.y - right.y;
  });
  ordered.forEach((layer, index) => { layer.zIndex = index + 1; });
}

function buildLayers(
  image: AnalysisImage,
  ocr: OcrResult | undefined,
  vision: VisionResult | undefined,
  colors: ColorResult | undefined,
  qrCodes: QrCodeResult[] | undefined,
  segmentations: SegmentationResult[] | undefined,
  backgroundVerified: boolean,
  designId: string,
  fontMatcher: NonNullable<RunModularAnalysisOptions['fontMatcher']> = matchFontCandidates
): { layers: DesignLayer[]; backgroundColor: string } {
  const layers: DesignLayer[] = [];
  const backgroundInfo = vision?.background;
  const backgroundColor = colorOr(backgroundInfo?.colors[0] ?? colors?.dominantColors[0], '#ffffff');

  if (!backgroundVerified) {
    const raster: ImageDesignLayer = {
      ...baseLayer('image-background-fallback', 'Raster — not fully editable', 'image', { x: 0, y: 0, width: image.width, height: image.height }, -100, null, 'fallback'),
      type: 'image',
      assetId: `original-${designId}`,
      crop: null,
      objectFit: 'cover',
      backgroundRemoved: false,
      originalCropAssetId: null,
      effects: [],
      needsReview: true,
      locked: true
    };
    raster.source.warning_flags = ['foreground_not_isolated'];
    return { layers: [raster], backgroundColor };
  }

  const reconstructedBackground: ImageDesignLayer = {
    ...baseLayer('image-background-fallback', 'Reconstructed background — raster', 'image', { x: 0, y: 0, width: image.width, height: image.height }, -100, null, 'fallback'),
    type: 'image',
    assetId: `clean-background-${designId}`,
    crop: null,
    objectFit: 'cover',
    backgroundRemoved: true,
    originalCropAssetId: null,
    effects: [],
    needsReview: true,
    locked: true
  };
  layers.push(reconstructedBackground);

  for (const [index, region] of (vision?.regions ?? []).entries()) {
    if (
      region.kind === 'shape' &&
      (vision?.shapes ?? []).some((shape) =>
        Math.min(region.box.x + region.box.width, shape.box.x + shape.box.width) >
          Math.max(region.box.x, shape.box.x) &&
        Math.min(region.box.y + region.box.height, shape.box.y + shape.box.height) >
          Math.max(region.box.y, shape.box.y)
      )
    ) continue;
    const box = normalizedBox(region.box, image.width, image.height);
    const label = region.kind === 'other' || region.kind === 'shape' ? 'Unclassified artwork'
      : region.kind === 'product' ? 'Product image'
      : region.kind === 'person' ? 'Person photo'
        : region.kind === 'logo' ? 'Logo'
          : region.kind === 'icon' ? 'Icon'
            : region.label || 'Photo';
    const layer: ImageDesignLayer = {
      ...baseLayer(`region-${index + 1}`, label, 'image', box, index, region.confidence, 'detector'),
      type: 'image',
      assetId: `crop-region-${index + 1}`,
      crop: null,
      objectFit: 'cover',
      backgroundRemoved: false,
      originalCropAssetId: null,
      effects: []
    };
    if (isMaskDataUri(segmentations?.[index]?.foregroundMask)) {
      layer.segmentationMaskAssetId = `foreground-${layer.id}`;
    } else {
      layer.name = `Raster — not fully editable: ${label}`;
      layer.locked = true;
      layer.source.warning_flags = ['foreground_not_isolated'];
    }
    layer.needsReview = true;
    layer.groupId = classifyRegion(region.label, box.y + box.height / 2, image.height);
    layers.push(layer);
  }

  for (const [index, shape] of (vision?.shapes ?? []).entries()) {
    const box = normalizedBox(shape.box, image.width, image.height);
    const layer: ShapeDesignLayer = {
      ...baseLayer(`shape-${index + 1}`, shape.label || (shape.shapeType === 'line' ? 'Divider line' : 'Decorative shape'), 'shape', box, 100 + index, shape.confidence, 'detector'),
      type: 'shape',
      shapeType: shape.shapeType,
      fill: shape.fill,
      gradient: null,
      stroke: shape.stroke,
      strokeWidth: Math.max(0, shape.strokeWidth || 0),
      cornerRadius: 0
    };
    layer.groupId = classifyRegion(shape.label, box.y + box.height / 2, image.height);
    layers.push(layer);
  }

  for (const [index, block] of (ocr?.blocks ?? []).entries()) {
    const box = normalizedBox(block.box, image.width, image.height);
    const fontMatch = matchFontCandidatesSafely({
      familyHint: block.fontFamilyHint,
      category: block.fontStyle,
      weight: block.estimatedWeight,
      isCondensed: block.isCondensed
    }, fontMatcher);
    const originalText = typeof block.text === 'string' ? block.text : '';
    const lineBreaks = Array.isArray(block.lineBreaks) ? block.lineBreaks : [];
    const lineCount = Math.max(1, lineBreaks.length + 1, originalText.split(/\r?\n/).length);
    const estimatedSize = block.estimatedFontSize && block.estimatedFontSize > 0
      ? block.estimatedFontSize
      : box.height / lineCount * 0.78;
    const textAlignment = block.alignment
      ?? (Math.abs(box.x + box.width / 2 - image.width / 2) < image.width * 0.08
        ? 'center'
        : box.x > image.width * 0.45 ? 'right' : 'left');
    const estimatedWeight = block.estimatedWeight && block.estimatedWeight >= 300 && block.estimatedWeight <= 900
      ? Math.round(block.estimatedWeight / 100) * 100
      : 400;
    const needsFontReview = fontMatch.confidence < 0.75 || (block.fontStyleConfidence ?? 0) < 0.75;
    const confidence = Number.isFinite(block.confidence) ? block.confidence : 0;
    const isUncertain = confidence < 0.75 || !originalText.trim();
    const name = meaningfulTextName(originalText, box, image.height);
    const layer: TextDesignLayer = {
      ...baseLayer(`text-${index + 1}`, name, 'text', box, 200 + index, confidence, 'ocr'),
      type: 'text',
      text: textWithLineBreaks(originalText, lineBreaks),
      lineBreaks,
      fontFamily: fontMatch.topFont,
      fontCandidates: fontMatch.candidates.slice(0, 3),
      fontSize: Math.max(6, Math.min(image.height * 0.2, estimatedSize)),
      fontWeight: estimatedWeight,
      fontStyle: 'normal',
      lineHeight: 1.2,
      letterSpacing: 0,
      align: textAlignment,
      fill: '#111111',
      stroke: null,
      shadow: null,
      effects: [],
      uncertain: isUncertain || fontMatch.failed,
      needsReview: needsFontReview || isUncertain,
      ...(fontMatch.failed ? { source: { origin: 'ocr' as const, originalBBox: box, warning_flags: ['font_detection_failed'] } } : {}),
      groupId: classifyRegion(block.text, box.y + box.height / 2, image.height)
    };
    layers.push(layer);
  }

  for (const [index, qr] of (qrCodes ?? []).entries()) {
    const box = normalizedBox(qr.box, image.width, image.height);
    const decodedOk = Boolean(qr.value?.trim()) && qr.confidence >= 0.75;
    const layer: QrDesignLayer = {
      ...baseLayer(`qr-${index + 1}`, `QR code ${index + 1}`, 'qr', box, 300 + index, qr.confidence, 'detector'),
      type: 'qr',
      value: decodedOk ? qr.value!.trim() : null,
      assetId: `original-${designId}`,
      crop: box,
      decodedOk,
      needsReview: !decodedOk || qr.confidence < 0.75,
      errorCorrection: 'M'
    };
    layers.push(layer);
  }

  for (const layer of layers) {
    if (layer.type === 'image' && layer.id !== 'image-background-fallback') layer.assetId = `crop-${layer.id}`;
    if (layer.type === 'text' && layer.name !== 'Unreadable text') layer.groupId = classifyRegion(layer.text, layer.y + layer.height / 2, image.height);
    if (layer.type === 'shape' && layer.name !== 'Background') layer.groupId = classifyRegion(layer.name, layer.y + layer.height / 2, image.height);
    if (layer.type === 'qr') {
      layer.name = 'QR code';
      layer.groupId = classifyRegion('', layer.y + layer.height / 2, image.height);
    }
  }
  return { layers, backgroundColor };
}

function groupLayersByRegion(layers: DesignLayer[]): DesignLayer[] {
  const groups: GroupDesignLayer[] = [];
  const regions = new Map<string, DesignLayer[]>();
  for (const layer of layers) {
    if (layer.type === 'group' || layer.name === 'Background' || layer.name === 'Original poster background') continue;
    const key = layer.groupId || 'main';
    const group = regions.get(key) ?? [];
    group.push(layer);
    regions.set(key, group);
  }
  for (const [region, children] of regions) {
    if (children.length < 2) continue;
    const id = `group-${region}`;
    const left = Math.min(...children.map((layer) => layer.x));
    const top = Math.min(...children.map((layer) => layer.y));
    const right = Math.max(...children.map((layer) => layer.x + layer.width));
    const bottom = Math.max(...children.map((layer) => layer.y + layer.height));
    children.forEach((layer) => { layer.groupId = id; });
    groups.push({
      ...baseLayer(id, `${region[0].toUpperCase()}${region.slice(1)} section`, 'group', { x: left, y: top, width: right - left, height: bottom - top }, -1, null, 'detector'),
      type: 'group',
      childIds: children.map((layer) => layer.id)
    });
  }
  return [...groups, ...layers];
}

function buildDocument(
  options: RunModularAnalysisOptions,
  image: AnalysisImage,
  results: CachedProviderResults,
  layers: DesignLayer[]
): DesignDocument {
  const now = new Date().toISOString();
  const document = createEmptyDocument({
    id: options.designId,
    name: safeName(options.designName),
    width: image.width,
    height: image.height,
    now
  });
  document.layers = layers;
  const background = results.vision?.background;
  const backgroundColor = colorOr(background?.colors[0] ?? results.colors?.dominantColors[0], '#ffffff');
  document.canvas.background = background?.type === 'gradient' && background.colors.length >= 2
    ? {
      type: 'gradient',
      gradient: {
        type: 'linear',
        angle: background.angle ?? 135,
        stops: background.colors.slice(0, 4).map((color, index, values) => ({
          color: colorOr(color, backgroundColor),
          offset: index / Math.max(1, values.length - 1)
        }))
      }
    }
    : { type: 'solid', color: backgroundColor };
  if (options.originalAssetId) {
    document.assets[options.originalAssetId] = {
      id: options.originalAssetId,
      mimeType: image.mimeType,
      uri: `indexeddb://${encodeURIComponent(options.originalAssetId)}`,
      name: `${safeName(options.designName)} (original)`
    };
    document.originalAsset = { assetId: options.originalAssetId };
  }
  document.assets[`original-${options.designId}`] = {
    id: `original-${options.designId}`,
    mimeType: image.mimeType,
    uri: options.originalAssetId
      ? `indexeddb://${encodeURIComponent(options.originalAssetId)}`
      : `data:${image.mimeType};base64,${image.bytes.toString('base64')}`,
    name: `${safeName(options.designName)} (raster fallback)`
  };
  if (results.backgroundVerified && results.background) {
    document.assets[`clean-background-${options.designId}`] = {
      id: `clean-background-${options.designId}`,
      mimeType: results.background.mimeType,
      uri: `data:${results.background.mimeType};base64,${results.background.bytes.toString('base64')}`,
      name: `${safeName(options.designName)} (reconstructed background raster)`
    };
  }
  document.updatedAt = now;
  return document;
}

export async function runModularAnalysis(options: RunModularAnalysisOptions): Promise<ModularAnalysisResult> {
  const providers = options.providers ?? createGeminiProviders();
  const hash = createHash('sha256').update(options.image.bytes).digest('hex');
  const stages: AnalysisStageReport[] = stageNames.map((name) => ({ name, status: 'pending' }));
  const progress: AnalysisProgress = { currentStage: null, stages, status: 'running', message: 'Analysis started.' };
  const context: ProviderContext = { signal: options.signal ?? new AbortController().signal };
  const results: CachedProviderResults = { availability: {} };
  let image = options.image;
  let cacheHit = false;
  let orderedLayers: DesignLayer[] = [];

  const runStage = async (
    name: AnalysisStageName,
    run: (stage: AnalysisStageReport) => Promise<void>
  ): Promise<void> => {
    const stage = stages.find((entry) => entry.name === name)!;
    if (context.signal.aborted) {
      stage.status = 'skipped';
      stage.message = 'Skipped because analysis was cancelled.';
      progress.currentStage = name;
      progress.status = 'cancelled';
      progress.message = stage.message;
      publish(progress, options.onProgress);
      return;
    }
    stage.status = 'running';
    stage.startedAt = new Date().toISOString();
    progress.currentStage = name;
    progress.message = `${name} in progress.`;
    publish(progress, options.onProgress);
    const startedAt = Date.now();
    try {
      await run(stage);
      if (stage.status === 'running') stage.status = 'completed';
      stage.completedAt = new Date().toISOString();
    } catch (error) {
      stage.status = 'failed';
      stage.error = error instanceof Error ? error.message : String(error);
      stage.message = `${name} failed; subsequent stages will continue.`;
      stage.completedAt = new Date().toISOString();
    } finally {
      stage.durationMs = Date.now() - startedAt;
      progress.message = stage.message ?? `${name} completed.`;
      publish(progress, options.onProgress);
    }
  };

  await runStage('validate', async (stage) => {
    const actualMime = getImageMime(image.bytes);
    if (!actualMime || actualMime !== image.mimeType) throw new Error('Image data does not match a supported JPEG, PNG, or WebP format.');
    if (image.bytes.length === 0 || image.bytes.length > 12 * 1024 * 1024) throw new Error('Analysis image must be between 1 byte and 12 MB.');
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width < 1 || image.height < 1) throw new Error('Image dimensions are invalid.');
    stage.message = `Validated ${actualMime} image (${image.width}×${image.height}).`;
    stageMetrics(stage, { bytes: image.bytes.length, width: image.width, height: image.height });
  });

  await runStage('normalize', async (stage) => {
    image = { ...image, mimeType: getImageMime(image.bytes)! };
    stage.message = 'Using the validated, size-limited analysis image; no original-resolution upload was made.';
    stageMetrics(stage, { width: image.width, height: image.height });
  });

  const cached = resultCache.get(hash);
  if (cached) {
    Object.assign(results, structuredClone(cached));
    cacheHit = true;
  }
  delete results.background;
  results.backgroundVerified = false;
  delete results.availability.background;

  await runStage('OCR', async (stage) => {
    if (results.ocr) {
      stage.status = 'skipped';
      stage.message = 'OCR results reused from image-hash cache.';
    } else {
      const result = await providers.ocr.recognize(image, context);
      if (result.status === 'unavailable') {
        results.availability.ocr = result.message;
        stage.status = 'skipped';
        stage.message = `${result.provider} unavailable: ${result.message}`;
      } else {
        results.ocr = result.value;
        stage.message = `Extracted ${result.value.blocks.length} text block(s) using ${result.provider}.`;
        stageMetrics(stage, { textBlocks: result.value.blocks.length });
      }
    }
  });

  await runStage('regions', async (stage) => {
    if (results.vision) {
      stage.status = 'skipped';
      stage.message = 'Region results reused from image-hash cache.';
    } else {
      const result = await providers.vision.analyze(image, context);
      if (result.status === 'unavailable') {
        results.availability.vision = result.message;
        stage.status = 'skipped';
        stage.message = `${result.provider} unavailable: ${result.message}`;
      } else {
        results.vision = result.value;
        stage.message = `Detected ${result.value.regions.length} region(s) using ${result.provider}.`;
        stageMetrics(stage, { regions: result.value.regions.length });
      }
    }
    if (results.vision?.regions.length && !results.segmentationAttempted) {
      results.segmentationAttempted = true;
      results.segmentation = [];
      for (const region of results.vision.regions) {
        const segmentation = await providers.segmentation.segment(image, region, context);
        if (segmentation.status === 'unavailable') {
          results.availability.segmentation = segmentation.message;
          stage.message = `${stage.message} Segmentation unavailable: ${segmentation.message}`;
          break;
        }
        results.segmentation.push(segmentation.value);
      }
    }
    if (results.vision?.regions.length) {
      stage.message = `${stage.message} Detected image regions remain rectangular source crops; foreground masks are not applied to editable layers.`;
    }
  });

  await runStage('colors', async (stage) => {
    if (results.colors) {
      stage.status = 'skipped';
      stage.message = 'Color results reused from image-hash cache.';
    } else {
      const result = await providers.colors.extract(image, results.vision?.regions ?? [], context);
      if (result.status === 'unavailable') {
        results.availability.colors = result.message;
        stage.status = 'skipped';
        stage.message = `${result.provider} unavailable: ${result.message}`;
      } else {
        results.colors = result.value;
        stage.message = `Extracted ${result.value.palette.length} palette color(s) using ${result.provider}.`;
        stageMetrics(stage, { paletteColors: result.value.palette.length, coloredRegions: result.value.regions.length });
      }
    }
  });

  await runStage('shapes/lines', async (stage) => {
    stage.message = results.vision
      ? `Retained ${results.vision.shapes.length} detected shape(s) and line(s).`
      : 'Skipped because the vision provider is unavailable.';
    if (!results.vision) stage.status = 'skipped';
    else stageMetrics(stage, { shapes: results.vision.shapes.length });
  });

  await runStage('QR', async (stage) => {
    if (results.qr) {
      stage.status = 'skipped';
      stage.message = 'QR results reused from image-hash cache.';
    } else {
      const result = await providers.qr.detect(image, context);
      if (result.status === 'unavailable') {
        results.availability.qr = result.message;
        stage.status = 'skipped';
        stage.message = `${result.provider} unavailable: ${result.message}`;
      } else {
        results.qr = result.value;
        stage.message = `Detected ${result.value.length} QR code(s) using ${result.provider}.`;
        stageMetrics(stage, { qrCodes: result.value.length });
      }
    }
  });

  await runStage('background reconstruction', async (stage) => {
    const regions = reconstructionRegions(results.ocr, results.vision, results.qr);
    if (!regions.length) {
      results.availability.background = 'No detected regions were available to remove and verify.';
      stage.status = 'skipped';
      stage.message = 'No reconstruction-safe editable elements were found; the poster will remain raster-only.';
      return;
    }
    const reconstructed = await providers.background.reconstruct(image, regions, context);
    if (reconstructed.status === 'unavailable') {
      results.availability.background = reconstructed.message;
      stage.status = 'skipped';
      stage.message = `${reconstructed.provider} unavailable: ${reconstructed.message}`;
      return;
    }
    const actualMime = getImageMime(reconstructed.value.bytes);
    if (!actualMime || actualMime !== reconstructed.value.mimeType) {
      throw new Error('Background reconstruction returned an invalid image or mismatched MIME type.');
    }
    const cleanedImage: AnalysisImage = {
      ...reconstructed.value,
      mimeType: actualMime,
      width: image.width,
      height: image.height
    };
    let cleanedOcr: OcrResult | undefined;
    let cleanedVision: VisionResult | undefined;
    let cleanedQr: QrCodeResult[] | undefined;
    if (regions.some((region) => region.kind === 'text')) {
      const result = await providers.ocr.recognize(cleanedImage, context);
      if (result.status === 'available') cleanedOcr = result.value;
      else results.availability.background = `OCR verification unavailable: ${result.message}`;
    }
    if (regions.some((region) => region.kind === 'image' || region.kind === 'shape')) {
      const result = await providers.vision.analyze(cleanedImage, context);
      if (result.status === 'available') cleanedVision = result.value;
      else results.availability.background = `Object/shape verification unavailable: ${result.message}`;
    }
    if (regions.some((region) => region.kind === 'qr')) {
      const result = await providers.qr.detect(cleanedImage, context);
      if (result.status === 'available') cleanedQr = result.value;
      else results.availability.background = `QR verification unavailable: ${result.message}`;
    }
    const verificationError = verifyReconstructedBackground(
      regions,
      cleanedOcr,
      cleanedVision,
      cleanedQr
    );
    if (verificationError) {
      results.availability.background = verificationError;
      stage.status = 'skipped';
      stage.message = `${verificationError} The poster will remain raster-only.`;
      return;
    }
    results.background = reconstructed.value;
    results.backgroundVerified = true;
    stage.message = `Removed and checked ${regions.length} detected region(s). Editable elements may be placed over the reconstructed raster background.`;
    stageMetrics(stage, { removedRegions: regions.length, verificationPassed: true });
  });

  await runStage('grouping', async (stage) => {
    const current = buildLayers(
      image,
      results.ocr,
      results.vision,
      results.colors,
      results.qr,
      results.segmentation,
      Boolean(results.backgroundVerified),
      options.designId,
      options.fontMatcher
    ).layers;
    orderedLayers = groupLayersByRegion(current);
    stage.message = `Grouped nearby text blocks; ${orderedLayers.filter((layer) => layer.type === 'group').length} group(s) identified.`;
    stageMetrics(stage, { groups: orderedLayers.filter((layer) => layer.type === 'group').length });
  });

  await runStage('layer ordering', async (stage) => {
    estimateZOrder(orderedLayers);
    orderedLayers.sort((left, right) => left.zIndex - right.zIndex);
    stage.message = `Ordered ${orderedLayers.length} layers by z-index, with visual regions below shapes, text, and QR codes.`;
    stageMetrics(stage, { layers: orderedLayers.length });
  });

  let document = createEmptyDocument({ id: options.designId, name: safeName(options.designName), width: image.width, height: image.height });
  await runStage('reconstruct', async (stage) => {
    const candidate = buildDocument(options, image, results, orderedLayers);
    candidate.analysis.provider = 'modular';
    candidate.analysis.status = 'partial';
    candidate.analysis.palette = results.colors;
    candidate.analysis.layoutDescription = results.vision?.layoutDescription;
    candidate.analysis.segmentations = results.segmentation;
    for (const [index, region] of (results.vision?.regions ?? []).entries()) {
      const layer = orderedLayers.find((entry) => entry.id === `region-${index + 1}`);
      const mask = results.segmentation?.[index]?.foregroundMask;
      if (!layer || layer.type !== 'image' || !isMaskDataUri(mask)) continue;
      const assetId = `foreground-${layer.id}`;
      candidate.assets[assetId] = {
        id: assetId,
        mimeType: mask.startsWith('data:image/svg+xml') ? 'image/svg+xml' : 'image/png',
        uri: mask,
        name: `${layer.name} foreground mask`
      };
      layer.segmentationMaskAssetId = assetId;
    }
    const validation = validateDocument(candidate);
    if (!validation.success) throw new Error(`Reconstructed document validation failed: ${validation.error.message}`);
    document = validation.data;
    stage.message = `Reconstructed ${document.layers.length} editable element(s) as a DesignDocument.`;
    stageMetrics(stage, { layers: document.layers.length });
  });

  await runStage('confidence scoring', async (stage) => {
    const confident = document.layers.flatMap((layer) => layer.type === 'group' ? [] : layer.confidence === null ? [] : [layer.confidence]);
    const score = confident.length ? confident.reduce((sum, value) => sum + value, 0) / confident.length : null;
    const warnings = Object.entries(results.availability).map(([provider, message]) => `${provider} unavailable: ${message}`);
    if (results.vision?.regions.length) {
      const unisolatedCount = document.layers.filter((layer) =>
        layer.type === 'image'
        && layer.source.origin === 'detector'
        && layer.source.warning_flags?.includes('foreground_not_isolated')
      ).length;
      if (unisolatedCount) {
        warnings.push(
          `${unisolatedCount} image region(s) are raster crops, not isolated objects. They remain locked and marked "Raster — not fully editable".`
        );
      }
    }
    if (!results.backgroundVerified) {
      warnings.push('Background reconstruction was not verified. The original poster is kept as a single raster-only layer; no editable overlays were added.');
    }
    if (document.layers.some((layer) => layer.type === 'text' && layer.source.warning_flags?.includes('font_detection_failed'))) {
      warnings.push('Font matching failed for one or more text layers; closest fallback fonts are available to choose in the editor.');
    }
    for (const [index, qr] of (results.qr ?? []).entries()) {
      if (!qr.value?.trim() || qr.confidence < 0.75) {
        warnings.push(`QR code ${index + 1} could not be decoded reliably; it was preserved as an image.`);
      }
    }
    if (cacheHit) warnings.push('Reused analysis provider results from the image-hash cache.');
    if (score === null) warnings.push('No provider detections were available to score.');
    document.analysis.warnings = warnings;
    document.analysis.status = warnings.length ? 'partial' : 'completed';
    document.analysis.analyzedAt = new Date().toISOString();
    document.analysis.stages = stages.map(({ name, status, message, error }) => ({
      name,
      status,
      ...(message ? { message } : {}),
      ...(error ? { error } : {})
    }));
    stage.message = score === null
      ? 'No detections were available for confidence scoring.'
      : `Mean detection confidence: ${Math.round(score * 100)}%.`;
    stageMetrics(stage, { scoredLayers: confident.length, ...(score === null ? {} : { meanConfidence: score }) });
  });

  if (!context.signal.aborted && (results.ocr || results.vision || results.colors || results.qr || results.segmentationAttempted)) {
    const cacheResults = structuredClone(results);
    delete cacheResults.background;
    delete cacheResults.backgroundVerified;
    delete cacheResults.availability.background;
    resultCache.delete(hash);
    resultCache.set(hash, cacheResults);
    if (resultCache.size > MAX_CACHE_ENTRIES) {
      const oldestHash = resultCache.keys().next().value;
      if (oldestHash) resultCache.delete(oldestHash);
    }
  }
  const failedStages = stages.filter((stage) => stage.status === 'failed').length;
  progress.currentStage = null;
  progress.stages = stages;
  progress.status = context.signal.aborted
    ? 'cancelled'
    : failedStages === stages.length
      ? 'failed'
      : failedStages > 0 || document.analysis.status === 'partial'
        ? 'partial'
        : 'completed';
  progress.message = progress.status === 'cancelled'
    ? 'Analysis cancelled.'
    : progress.status === 'completed'
      ? 'Analysis completed.'
      : 'Analysis completed with unavailable or failed stages.';
  const failedWarnings = stages
    .filter((stage) => stage.status === 'failed')
    .map((stage) => `${stage.name} failed: ${stage.error || stage.message || 'Unknown error.'}`);
  if (progress.status === 'cancelled') failedWarnings.push('Analysis was cancelled before all stages completed.');
  document.analysis.warnings = [...new Set([...document.analysis.warnings, ...failedWarnings])];
  if (document.analysis.warnings.length) document.analysis.status = 'partial';
  document.analysis.stages = stages.map(({ name, status, message, error }) => ({
    name,
    status,
    ...(message ? { message } : {}),
    ...(error ? { error } : {})
  }));
  publish(progress, options.onProgress);

  const validation = validateDocument(document);
  if (!validation.success) {
    throw new Error(`Pipeline produced an invalid DesignDocument: ${validation.error.message}`);
  }
  return { document: validation.data, imageHash: hash, stageReport: stages, status: progress.status };
}

export function clearAnalysisCache(imageHash?: string): void {
  if (imageHash) resultCache.delete(imageHash);
  else resultCache.clear();
}

export function getAnalysisCacheSize(): number {
  return resultCache.size;
}

export function createAnalysisImage(bytes: Buffer, mimeType: string, width: number, height: number): AnalysisImage {
  return { bytes, mimeType, width, height };
}

export type { AnalysisProviders, AnalysisImage, ProviderResult };
