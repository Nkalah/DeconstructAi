import { z } from 'zod';

const finite = z.number().finite();
const pointTransform = z.object({
  x: finite,
  y: finite,
  width: finite.nonnegative().max(30_000),
  height: finite.nonnegative().max(30_000),
  rotation: finite
}).strict();
const effects = z.object({
  shadow: z.object({
    enabled: z.boolean(),
    offset_x: finite,
    offset_y: finite,
    blur: finite.nonnegative(),
    color: z.string().max(128),
    opacity: finite.min(0).max(1)
  }).strict(),
  stroke: z.object({
    enabled: z.boolean(),
    width: finite.nonnegative(),
    color: z.string().max(128)
  }).strict(),
  gradient: z.object({
    enabled: z.boolean(),
    type: z.enum(['linear', 'radial']),
    angle: finite.optional(),
    stops: z.array(z.object({ color: z.string().max(128), offset: finite.min(0).max(1) }).strict()).max(16)
  }).strict().optional()
}).passthrough();
const baseLayer = {
  id: z.string().min(1).max(120),
  name: z.string().max(240),
  z_index: z.number().int().safe(),
  transform: pointTransform,
  opacity: finite.min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
  source: z.object({
    detection_confidence: finite.min(0).max(1),
    extraction_method: z.enum(['ocr', 'segmentation', 'inpainted_reconstruction', 'user_added']),
    warning_flags: z.array(z.enum([
      'approximate_font',
      'low_confidence_face_overlap',
      'seam_detected',
      'clipped_on_resize',
      'ambiguous_z_order',
      'font_detection_failed',
      'qr_decode_unreliable'
    ])).max(32).optional()
  }).passthrough(),
  style: z.object({
    effects,
    opacity: finite.min(0).max(1).optional(),
    blend_mode: z.string().max(64).optional(),
    border_radius: finite.nonnegative().optional()
  }).passthrough()
};
const textLayer = z.object({
  ...baseLayer,
  type: z.literal('text'),
  type_specific: z.object({
    content: z.string().max(200_000),
    font_family: z.string().min(1).max(128),
    font_family_confidence: finite.min(0).max(1),
    font_size: finite.positive().max(10_000),
    font_weight: z.union([z.string().max(32), finite]),
    font_style: z.enum(['normal', 'italic']).optional(),
    color: z.string().max(128),
    alignment: z.enum(['left', 'center', 'right', 'justify']),
    line_height: finite.positive().optional(),
    letter_spacing: finite.optional(),
    direction: z.enum(['auto', 'ltr', 'rtl']).optional(),
    line_breaks: z.array(z.number().int().nonnegative()).max(10_000).optional(),
    uncertain: z.boolean().optional(),
    candidate_fonts: z.array(z.object({
      family: z.string().min(1).max(128),
      confidence: finite.min(0).max(1),
      category: z.enum(['sans-serif', 'serif', 'display', 'handwriting', 'monospace'])
    }).strict()).max(8).optional()
  }).passthrough()
}).passthrough();
const imageLayer = z.object({
  ...baseLayer,
  type: z.literal('image'),
  type_specific: z.object({
    image_url: z.string().max(16_000_000),
    mask_shape: z.enum(['rect', 'circle', 'ellipse', 'rounded_rect', 'custom_path']),
    object_fit: z.enum(['contain', 'cover', 'fill', 'none', 'scale-down']).optional(),
    replaceable: z.boolean(),
    object_label: z.string().max(240).optional(),
    crop_transform: z.object({ scale: finite.positive(), offset_x: finite, offset_y: finite }).optional(),
    original_extracted_url: z.string().max(16_000_000).optional(),
    is_human_or_face: z.boolean().optional()
  }).passthrough()
}).passthrough();
const shapeLayer = z.object({
  ...baseLayer,
  type: z.literal('shape'),
  type_specific: z.object({
    shape_type: z.enum(['rect', 'ellipse', 'polygon', 'pill', 'divider', 'path']),
    fill_color: z.string().max(128),
    path_data: z.string().max(100_000).optional(),
    points: z.number().int().positive().max(200).optional()
  }).passthrough()
}).passthrough();
const iconLayer = z.object({
  ...baseLayer,
  type: z.literal('icon'),
  type_specific: z.object({
    icon_name: z.string().min(1).max(120),
    svg_or_path_data: z.string().max(100_000).optional(),
    fill_color: z.string().max(128),
    image_url: z.string().max(16_000_000).optional(),
    qr_value: z.string().max(10_000).nullable().optional(),
    qr_decoded_ok: z.boolean().optional(),
    qr_fallback_crop: z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive() }).nullable().optional(),
    qr_generated: z.boolean().optional()
  }).passthrough()
}).passthrough();
const backgroundLayer = z.object({
  ...baseLayer,
  type: z.literal('background_fill'),
  type_specific: z.object({
    fill_type: z.enum(['solid', 'linear_gradient', 'radial_gradient', 'reconstructed_texture', 'transparent']),
    colors: z.array(z.string().max(128)).max(16),
    angle: finite,
    reconstructed_image_url: z.string().max(16_000_000).optional(),
    deterministic_inferred: z.boolean().optional(),
    seam_score: finite.min(0).max(1).optional()
  }).passthrough()
}).passthrough();

export const SceneGraphSchema = z.object({
  design_id: z.string().min(1).max(120),
  name: z.string().max(240),
  created_at: z.string().max(64),
  updated_at: z.string().max(64),
  canvas: z.object({
    width: finite.int().positive().max(30_000),
    height: finite.int().positive().max(30_000),
    background_color: z.string().max(128).nullable(),
    aspect_ratio_name: z.string().max(64).optional()
  }).passthrough().refine((canvas) => canvas.width * canvas.height <= 100_000_000, 'Canvas exceeds the 100 million pixel limit.'),
  layers: z.array(z.discriminatedUnion('type', [textLayer, imageLayer, shapeLayer, iconLayer, backgroundLayer])).max(2000),
  original_image_url: z.string().max(16_000_000).optional(),
  original_asset_id: z.string().max(120).optional(),
  pipeline_meta: z.object({
    total_duration_ms: finite.nonnegative(),
    stages: z.array(z.object({
      stage: z.number().int().nonnegative(),
      name: z.string().max(120),
      duration_ms: finite.nonnegative(),
      status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
      message: z.string().max(2000).optional(),
      metrics: z.record(z.string(), z.unknown()).optional()
    }).passthrough()).max(100),
    overall_confidence: finite.min(0).max(1),
    warning_count: z.number().int().nonnegative(),
    deterministic_background_used: z.boolean()
  }).passthrough().optional()
}).passthrough();
