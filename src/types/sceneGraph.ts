export type LayerType = 'text' | 'image' | 'shape' | 'icon' | 'background_fill';

export type ExtractionMethod = 'ocr' | 'segmentation' | 'inpainted_reconstruction' | 'raster' | 'user_added';

export type WarningFlag = 
  | 'approximate_font' 
  | 'low_confidence_face_overlap' 
  | 'seam_detected' 
  | 'clipped_on_resize' 
  | 'ambiguous_z_order'
  | 'font_detection_failed'
  | 'qr_decode_unreliable'
  | 'foreground_not_isolated';

export interface LayerTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // in degrees
}

export interface ShadowEffect {
  enabled: boolean;
  offset_x: number;
  offset_y: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface StrokeEffect {
  enabled: boolean;
  width: number;
  color: string;
}

export interface GradientStop {
  color: string;
  offset: number; // 0 to 1
}

export interface GradientEffect {
  enabled: boolean;
  type: 'linear' | 'radial';
  stops: GradientStop[];
  angle?: number;
}

export interface LayerEffects {
  shadow: ShadowEffect;
  stroke: StrokeEffect;
  gradient?: GradientEffect;
}

export interface LayerStyle {
  effects: LayerEffects;
  opacity?: number;
  blend_mode?: string;
  border_radius?: number;
}

export interface LayerSource {
  detection_confidence: number; // 0.0 - 1.0
  extraction_method: ExtractionMethod;
  original_crop_url?: string | null;
  warning_flags?: WarningFlag[];
  semantic_category?: string;
}

export interface FontCandidate {
  family: string;
  confidence: number;
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
}

export interface TextLayerSpecific {
  content: string;
  line_breaks?: number[];
  uncertain?: boolean;
  direction?: 'auto' | 'ltr' | 'rtl';
  font_family: string;
  font_family_confidence: number;
  font_size: number;
  font_weight: string | number; // 'normal', 'bold', '600', '800', etc.
  font_style?: 'normal' | 'italic';
  color: string;
  alignment: 'left' | 'center' | 'right' | 'justify';
  letter_spacing?: number;
  line_height?: number;
  candidate_fonts?: FontCandidate[];
  semantic_role?: 'headline' | 'subhead' | 'body' | 'date_time' | 'location' | 'cta' | 'badge' | 'contact_info';
}

export interface ImageLayerSpecific {
  image_url: string;
  mask_shape: 'rect' | 'circle' | 'ellipse' | 'rounded_rect' | 'custom_path';
  object_fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  crop_transform?: {
    scale: number;
    offset_x: number;
    offset_y: number;
  };
  replaceable: boolean;
  object_label?: string;
  original_extracted_url?: string;
  is_human_or_face?: boolean;
}

export interface ShapeLayerSpecific {
  shape_type: 'rect' | 'ellipse' | 'polygon' | 'pill' | 'divider' | 'path';
  fill_color: string;
  path_data?: string;
  points?: number; // for polygons / stars
}

export interface IconLayerSpecific {
  icon_name: string;
  svg_or_path_data?: string;
  fill_color: string;
  image_url?: string;
  qr_value?: string | null;
  qr_decoded_ok?: boolean;
  qr_fallback_crop?: { x: number; y: number; width: number; height: number } | null;
  qr_generated?: boolean;
}

export interface BackgroundFillSpecific {
  fill_type: 'solid' | 'linear_gradient' | 'radial_gradient' | 'reconstructed_texture' | 'transparent';
  colors: string[];
  angle: number; // in degrees for linear gradient
  reconstructed_image_url?: string;
  deterministic_inferred?: boolean;
  seam_score?: number; // 0-1, >0.4 flags seam warning
}

export interface BaseLayer {
  id: string;
  name: string;
  type: LayerType;
  z_index: number;
  transform: LayerTransform;
  opacity: number;
  visible: boolean;
  locked: boolean;
  source: LayerSource;
  style: LayerStyle;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  type_specific: TextLayerSpecific;
}

export interface TextStyleClipboard {
  font_family: string;
  font_size: number;
  font_weight: string | number;
  font_style: 'normal' | 'italic';
  direction: 'auto' | 'ltr' | 'rtl';
  line_height: number;
  letter_spacing: number;
  alignment: TextLayerSpecific['alignment'];
  color: string;
  rotation: number;
  opacity: number;
  stroke: StrokeEffect;
  shadow: ShadowEffect;
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  type_specific: ImageLayerSpecific;
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  type_specific: ShapeLayerSpecific;
}

export interface IconLayer extends BaseLayer {
  type: 'icon';
  type_specific: IconLayerSpecific;
}

export interface BackgroundFillLayer extends BaseLayer {
  type: 'background_fill';
  type_specific: BackgroundFillSpecific;
}

export type Layer = TextLayer | ImageLayer | ShapeLayer | IconLayer | BackgroundFillLayer;

export interface DesignCanvas {
  width: number;
  height: number;
  background_color: string | null;
  aspect_ratio_name?: string;
}

export interface PipelineStageLog {
  stage: number;
  name: string;
  duration_ms: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  message?: string;
  metrics?: Record<string, any>;
}

export interface SceneGraph {
  design_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  canvas: DesignCanvas;
  layers: Layer[];
  original_image_url?: string;
  original_asset_id?: string;
  pipeline_meta?: {
    total_duration_ms: number;
    stages: PipelineStageLog[];
    overall_confidence: number;
    warning_count: number;
    deterministic_background_used: boolean;
  };
}

export type MutationType =
  | 'update_text'
  | 'replace_image'
  | 'set_color'
  | 'set_effect'
  | 'delete_layer'
  | 'add_layer'
  | 'reorder_layer'
  | 'rename_layer'
  | 'update_transform'
  | 'toggle_visibility'
  | 'toggle_lock'
  | 'resize_canvas'
  | 'update_qr'
  | 'batch_mutation';

export interface MutationOperation {
  type: MutationType;
  layer_id?: string;
  params: Record<string, any>;
  description?: string;
}

export interface CanvasPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  aspectRatio: string;
}
