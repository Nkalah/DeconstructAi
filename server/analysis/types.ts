export interface AnalysisImage {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextBlock {
  text: string;
  box: NormalizedBox;
  lineBreaks: number[];
  language: string | null;
  confidence: number;
  estimatedFontSize?: number;
  estimatedWeight?: number;
  fontFamilyHint?: string;
  fontStyleConfidence?: number;
  fontStyle?: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
  isCondensed?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

export interface OcrResult {
  blocks: TextBlock[];
}

export type RegionKind = 'person' | 'product' | 'logo' | 'icon' | 'photo' | 'shape' | 'other';

export interface VisionRegion {
  label: string;
  kind: RegionKind;
  box: NormalizedBox;
  confidence: number;
  description: string;
}

export interface VisionShape {
  label: string;
  shapeType: 'rect' | 'ellipse' | 'line' | 'polygon';
  box: NormalizedBox;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  confidence: number;
}

export interface VisionResult {
  regions: VisionRegion[];
  shapes: VisionShape[];
  layoutDescription: string;
  background?: {
    type: 'solid' | 'gradient' | 'complex';
    colors: string[];
    angle?: number;
    confidence: number;
  };
}

export interface SegmentationResult {
  foregroundMask: string;
  backgroundMask: string;
  box: NormalizedBox;
}

export interface QrCodeResult {
  box: NormalizedBox;
  value: string | null;
  confidence: number;
}

export interface RegionColor {
  box: NormalizedBox;
  dominant: string;
  palette: string[];
}

export interface ColorResult {
  palette: string[];
  dominantColors: string[];
  regions: RegionColor[];
}

export type ProviderResult<T> =
  | { status: 'available'; provider: string; value: T }
  | { status: 'unavailable'; provider: string; value: null; message: string };

export interface ProviderContext {
  signal: AbortSignal;
}

export interface OcrProvider {
  readonly name: string;
  recognize(image: AnalysisImage, context: ProviderContext): Promise<ProviderResult<OcrResult>>;
}

export interface VisionProvider {
  readonly name: string;
  analyze(image: AnalysisImage, context: ProviderContext): Promise<ProviderResult<VisionResult>>;
}

export interface SegmentationProvider {
  readonly name: string;
  segment(image: AnalysisImage, region: VisionRegion, context: ProviderContext): Promise<ProviderResult<SegmentationResult>>;
}

export interface QrProvider {
  readonly name: string;
  detect(image: AnalysisImage, context: ProviderContext): Promise<ProviderResult<QrCodeResult[]>>;
}

export interface ColorProvider {
  readonly name: string;
  extract(image: AnalysisImage, regions: VisionRegion[], context: ProviderContext): Promise<ProviderResult<ColorResult>>;
}

export interface ReconstructionRegion {
  label: string;
  kind: 'text' | 'image' | 'shape' | 'qr';
  box: NormalizedBox;
}

export interface BackgroundReconstructionResult {
  bytes: Buffer;
  mimeType: string;
}

export interface BackgroundReconstructionProvider {
  readonly name: string;
  reconstruct(
    image: AnalysisImage,
    regions: ReconstructionRegion[],
    context: ProviderContext
  ): Promise<ProviderResult<BackgroundReconstructionResult>>;
}

export interface AnalysisProviders {
  ocr: OcrProvider;
  vision: VisionProvider;
  segmentation: SegmentationProvider;
  qr: QrProvider;
  colors: ColorProvider;
  background: BackgroundReconstructionProvider;
}

export type AnalysisStageName =
  | 'validate'
  | 'normalize'
  | 'OCR'
  | 'regions'
  | 'colors'
  | 'shapes/lines'
  | 'QR'
  | 'background reconstruction'
  | 'grouping'
  | 'layer ordering'
  | 'reconstruct'
  | 'confidence scoring';

export type AnalysisStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface AnalysisStageReport {
  name: AnalysisStageName;
  status: AnalysisStageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  message?: string;
  error?: string;
  metrics?: Record<string, number | string | boolean>;
}

export interface AnalysisProgress {
  currentStage: AnalysisStageName | null;
  stages: AnalysisStageReport[];
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
  message: string;
}
