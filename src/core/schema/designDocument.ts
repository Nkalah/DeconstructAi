import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 1;

const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
}).passthrough();

const layerSourceSchema = z.object({
  origin: z.enum(['ocr', 'detector', 'user', 'fallback']),
  originalBBox: bboxSchema.nullable(),
  originalCropAssetId: z.string().nullable().optional(),
  warning_flags: z.array(z.enum(['font_detection_failed', 'foreground_not_isolated'])).optional(),
}).passthrough();

const effectSchema = z.object({
  type: z.string().min(1),
  enabled: z.boolean(),
  params: z.record(z.string(), z.unknown()),
}).passthrough();

const baseLayerSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  zIndex: z.number().int(),
  locked: z.boolean(),
  visible: z.boolean(),
  groupId: z.string().optional(),
  source: layerSourceSchema,
  confidence: z.number().min(0).max(1).nullable(),
  needsReview: z.boolean(),
}).passthrough();

const textLayerSchema = baseLayerSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  lineBreaks: z.array(z.number().int().nonnegative()).optional(),
  direction: z.enum(['auto', 'ltr', 'rtl']).optional(),
  fontFamily: z.string(),
  fontCandidates: z.array(z.object({
    family: z.string(),
    confidence: z.number().min(0).max(1),
    category: z.enum(['sans-serif', 'serif', 'display', 'handwriting', 'monospace']),
  })).optional(),
  fontSize: z.number().positive(),
  fontWeight: z.union([z.string(), z.number()]),
  fontStyle: z.enum(['normal', 'italic']),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
  align: z.enum(['left', 'center', 'right', 'justify']),
  fill: z.string(),
  stroke: z.object({ color: z.string(), width: z.number().nonnegative() }).nullable(),
  shadow: z.object({
    color: z.string(),
    blur: z.number().nonnegative(),
    offsetX: z.number(),
    offsetY: z.number(),
    opacity: z.number().min(0).max(1),
  }).nullable(),
  reconstructedOriginal: z.object({
    text: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
    fontFamily: z.string(),
    fontSize: z.number().positive(),
    fontWeight: z.union([z.string(), z.number()]),
    fontStyle: z.enum(['normal', 'italic']),
    lineHeight: z.number().positive(),
    letterSpacing: z.number(),
    align: z.enum(['left', 'center', 'right', 'justify']),
    fill: z.string(),
    stroke: z.object({ color: z.string(), width: z.number().nonnegative() }).nullable(),
    shadow: z.object({
      color: z.string(),
      blur: z.number().nonnegative(),
      offsetX: z.number(),
      offsetY: z.number(),
      opacity: z.number().min(0).max(1),
    }).nullable(),
    direction: z.enum(['auto', 'ltr', 'rtl']).optional(),
    uncertain: z.boolean().optional(),
    fontFamilyConfidence: z.number().min(0).max(1).optional(),
  }).optional(),
  effects: z.array(effectSchema),
  uncertain: z.boolean(),
});

const imageLayerSchema = baseLayerSchema.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  crop: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).passthrough().nullable(),
  maskShape: z.enum(['rect', 'circle', 'ellipse', 'rounded_rect', 'custom_path']).optional(),
  objectFit: z.enum(['contain', 'cover', 'fill', 'none', 'scale-down']),
  backgroundRemoved: z.boolean(),
  originalCropAssetId: z.string().nullable(),
  segmentationMaskAssetId: z.string().nullable().optional(),
  effects: z.array(effectSchema),
});

const gradientSchema = z.object({
  type: z.enum(['linear', 'radial']),
  angle: z.number().optional(),
  stops: z.array(z.object({
    color: z.string(),
    offset: z.number().min(0).max(1),
  }).passthrough()).min(1),
}).passthrough();

const shapeLayerSchema = baseLayerSchema.extend({
  type: z.literal('shape'),
  shapeType: z.enum(['rect', 'ellipse', 'line', 'polygon']),
  fill: z.string().nullable(),
  gradient: gradientSchema.nullable(),
  stroke: z.string().nullable(),
  strokeWidth: z.number().nonnegative(),
  cornerRadius: z.number().nonnegative(),
});

const qrLayerSchema = baseLayerSchema.extend({
  type: z.literal('qr'),
  value: z.string().nullable(),
  assetId: z.string().min(1).optional(),
  crop: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).passthrough().nullable().optional(),
  generated: z.boolean().optional(),
  decodedOk: z.boolean(),
  errorCorrection: z.enum(['L', 'M', 'Q', 'H']),
});

const groupLayerSchema = baseLayerSchema.extend({
  type: z.literal('group'),
  childIds: z.array(z.string().min(1)),
});

export const DesignLayerSchema = z.discriminatedUnion('type', [
  textLayerSchema,
  imageLayerSchema,
  shapeLayerSchema,
  qrLayerSchema,
  groupLayerSchema,
]);

export const DesignDocumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().positive(),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    unit: z.enum(['px', 'pt', 'mm', 'in']),
    background: z.discriminatedUnion('type', [
      z.object({ type: z.literal('solid'), color: z.string() }).passthrough(),
      z.object({ type: z.literal('gradient'), gradient: gradientSchema }).passthrough(),
      z.object({ type: z.literal('transparent') }).passthrough(),
    ]),
  }).passthrough(),
  layers: z.array(DesignLayerSchema),
  assets: z.record(z.string(), z.object({
    id: z.string().min(1),
    mimeType: z.string().min(1),
    uri: z.string().min(1),
    name: z.string().optional(),
  }).passthrough()),
  originalAsset: z.object({ assetId: z.string().min(1) }).passthrough().nullable(),
  analysis: z.object({
    status: z.enum(['not_started', 'completed', 'partial', 'failed']),
    provider: z.string().nullable(),
    analyzedAt: z.string().datetime().nullable(),
    stages: z.array(z.object({
      name: z.string(),
      status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
      message: z.string().optional(),
    }).passthrough()),
    warnings: z.array(z.string()),
  }).passthrough(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).passthrough();

export type DesignDocument = z.infer<typeof DesignDocumentSchema>;
export type DesignLayer = z.infer<typeof DesignLayerSchema>;
export type TextDesignLayer = z.infer<typeof textLayerSchema>;
export type ImageDesignLayer = z.infer<typeof imageLayerSchema>;
export type ShapeDesignLayer = z.infer<typeof shapeLayerSchema>;
export type QrDesignLayer = z.infer<typeof qrLayerSchema>;
export type GroupDesignLayer = z.infer<typeof groupLayerSchema>;
export type LayerSource = z.infer<typeof layerSourceSchema>;
export type BoundingBox = z.infer<typeof bboxSchema>;

export interface EmptyDocumentOptions {
  id?: string;
  name?: string;
  width?: number;
  height?: number;
  unit?: DesignDocument['canvas']['unit'];
  now?: string;
}

export function createEmptyDocument(options: EmptyDocumentOptions = {}): DesignDocument {
  const now = options.now ?? new Date().toISOString();
  return DesignDocumentSchema.parse({
    id: options.id ?? crypto.randomUUID(),
    name: options.name ?? 'Untitled design',
    version: 1,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    canvas: {
      width: options.width ?? 1080,
      height: options.height ?? 1350,
      unit: options.unit ?? 'px',
      background: { type: 'solid', color: '#ffffff' },
    },
    layers: [],
    assets: {},
    originalAsset: null,
    analysis: {
      status: 'not_started',
      provider: null,
      analyzedAt: null,
      stages: [],
      warnings: [],
    },
    createdAt: now,
    updatedAt: now,
  });
}

export function validateDocument(input: unknown) {
  return DesignDocumentSchema.safeParse(input);
}

export function migrateDocument(input: unknown): DesignDocument {
  const current = validateDocument(input);
  if (current.success) return current.data;

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Cannot migrate document: expected a design document object.');
  }

  const candidate = input as Record<string, unknown>;
  const schemaVersion = candidate.schemaVersion ?? 0;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 0) {
    throw new Error('Cannot migrate document: schemaVersion must be a non-negative integer.');
  }
  if (schemaVersion >= CURRENT_SCHEMA_VERSION) {
    throw new Error(`Cannot migrate document schema version ${schemaVersion}.`);
  }

  const migrated = DesignDocumentSchema.safeParse({
    ...candidate,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  if (!migrated.success) {
    throw new Error(`Cannot migrate document: ${migrated.error.message}`);
  }
  return migrated.data;
}

export function serializeDocument(document: DesignDocument): string {
  const validation = validateDocument(document);
  if (!validation.success) {
    throw new Error(`Cannot serialize invalid document: ${validation.error.message}`);
  }
  return JSON.stringify(validation.data);
}

export function deserializeDocument(json: string): DesignDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot deserialize document JSON: ${message}`);
  }
  return migrateDocument(parsed);
}
