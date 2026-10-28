import { GoogleGenAI } from '@google/genai';
import type {
  AnalysisImage,
  BackgroundReconstructionProvider,
  BackgroundReconstructionResult,
  ColorProvider,
  ColorResult,
  OcrProvider,
  OcrResult,
  ProviderContext,
  ProviderResult,
  QrCodeResult,
  QrProvider,
  ReconstructionRegion,
  RegionKind,
  SegmentationProvider,
  SegmentationResult,
  VisionProvider,
  VisionRegion,
  VisionResult
} from './types.js';

const MODEL = process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
const BACKGROUND_MODEL = process.env.GEMINI_BACKGROUND_MODEL || 'gemini-2.5-flash-image';

function unavailable<T>(provider: string): ProviderResult<T> {
  return {
    status: 'unavailable',
    provider,
    value: null,
    message: 'GEMINI_API_KEY is not configured.'
  };
}

function parseJson<T>(text: string | undefined): T {
  if (!text) throw new Error('The vision provider returned an empty response.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('The vision provider returned malformed JSON.');
  }
}

async function askGemini<T>(
  ai: GoogleGenAI,
  image: AnalysisImage,
  prompt: string,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) throw new Error('Analysis cancelled.');
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: {
      parts: [
        { inlineData: { data: image.bytes.toString('base64'), mimeType: image.mimeType } },
        { text: prompt }
      ]
    },
    config: { responseMimeType: 'application/json' }
  });
  if (signal.aborted) throw new Error('Analysis cancelled.');
  return parseJson<T>(response.text);
}

function makeAi(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? new GoogleGenAI({ apiKey: key }) : null;
}

export class GeminiOcrProvider implements OcrProvider {
  readonly name = 'gemini-ocr';
  private readonly ai = makeAi();

  async recognize(image: AnalysisImage, { signal }: ProviderContext): Promise<ProviderResult<OcrResult>> {
    if (!this.ai) return unavailable(this.name);
    const value = await askGemini<OcrResult>(
      this.ai,
      image,
      `Transcribe every visible text block exactly. The original canvas is ${image.width}x${image.height} pixels; estimate font size in those canvas pixels. Return JSON {blocks:[{text,box:{x,y,width,height},lineBreaks:[character offsets where lines break],language,confidence,estimatedFontSize,estimatedWeight,fontFamilyHint,fontStyle,fontStyleConfidence,isCondensed,alignment}]}. Box coordinates are normalized to 0..1 from top-left. lineBreaks are character offsets in text, excluding newline characters. fontStyle must be sans-serif, serif, display, handwriting, or monospace; alignment must be left, center, right, or justify. Estimate visual typography only; do not alter, complete, or invent text. Keep uncertain readable fragments and use an empty string only when no glyph can be read.`,
      signal
    );
    return { status: 'available', provider: this.name, value };
  }
}

export class GeminiVisionProvider implements VisionProvider {
  readonly name = 'gemini-vision';
  private readonly ai = makeAi();

  async analyze(image: AnalysisImage, { signal }: ProviderContext): Promise<ProviderResult<VisionResult>> {
    if (!this.ai) return unavailable(this.name);
    const value = await askGemini<VisionResult>(
      this.ai,
      image,
      'Analyze the poster layout. Return JSON {regions:[{label,kind,box,confidence,description}],shapes:[{label,shapeType,box,fill,stroke,strokeWidth,confidence}],background:{type,colors,angle,confidence},layoutDescription}. kind must be person, product, logo, icon, photo, shape, or other. shapeType must be rect, ellipse, line, or polygon. background type must be solid, gradient, or complex, with observed colors and optional gradient angle. Boxes use normalized 0..1 coordinates from top-left. Include actual visual regions and geometric shapes only; do not invent unseen content.',
      signal
    );
    return { status: 'available', provider: this.name, value };
  }
}

export class UnavailableSegmentationProvider implements SegmentationProvider {
  readonly name = 'segmentation-unconfigured';

  async segment(
    _image: AnalysisImage,
    _region: VisionRegion,
    _context: ProviderContext
  ): Promise<ProviderResult<SegmentationResult>> {
    return {
      status: 'unavailable',
      provider: this.name,
      value: null,
      message: 'No segmentation model is configured.'
    };
  }
}

export class GeminiSegmentationProvider implements SegmentationProvider {
  readonly name = 'gemini-region-mask';
  private readonly ai = makeAi();

  async segment(
    image: AnalysisImage,
    region: VisionRegion,
    { signal }: ProviderContext
  ): Promise<ProviderResult<SegmentationResult>> {
    if (!this.ai) return unavailable(this.name);
    const result = await askGemini<{ confidence: number; points: Array<{ x: number; y: number }> }>(
      this.ai,
      image,
      `Create a foreground silhouette mask for only this detected ${JSON.stringify(region.kind)} region (${JSON.stringify(region.label)}), whose normalized full-image box is ${JSON.stringify(region.box)}. Return JSON {confidence,points:[{x,y}]}, where points trace the visible object's outer contour in clockwise order using coordinates normalized 0..1 relative to the region box (not the full image). Use at least 12 contour points for curved objects. Do not include nearby text, other objects, or background. If the region is not a single separable foreground object, return confidence below 0.65 and an empty points array.`,
      signal
    );
    const points = Array.isArray(result.points)
      ? result.points.filter((point) =>
        Number.isFinite(point?.x) && Number.isFinite(point?.y)
        && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
      ).slice(0, 256)
      : [];
    if (!Number.isFinite(result.confidence) || result.confidence < 0.75 || result.confidence > 1 || points.length < 3) {
      return {
        status: 'unavailable',
        provider: this.name,
        value: null,
        message: `A reliable foreground contour was not returned for ${region.label}.`
      };
    }
    const polygon = points.map((point) => `${(point.x * 256).toFixed(1)},${(point.y * 256).toFixed(1)}`).join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="black"/><polygon points="${polygon}" fill="white"/></svg>`;
    return {
      status: 'available',
      provider: this.name,
      value: {
        foregroundMask: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        backgroundMask: '',
        box: region.box
      }
    };
  }
}

export class GeminiBackgroundReconstructionProvider implements BackgroundReconstructionProvider {
  readonly name = 'gemini-background-reconstruction';
  private readonly ai = makeAi();

  async reconstruct(
    image: AnalysisImage,
    regions: ReconstructionRegion[],
    { signal }: ProviderContext
  ): Promise<ProviderResult<BackgroundReconstructionResult>> {
    if (!this.ai) return unavailable(this.name);
    if (signal.aborted) throw new Error('Analysis cancelled.');
    const response = await this.ai.models.generateContent({
      model: BACKGROUND_MODEL,
      contents: {
        parts: [
          { inlineData: { data: image.bytes.toString('base64'), mimeType: image.mimeType } },
          {
            text: `Edit this poster image into a clean background plate. Remove the visual content inside every listed region, including text glyphs, photos, people, logos, icons, QR codes, and decorative shapes. Reconstruct only the background that should continue behind them. Do not redraw, preserve, paraphrase, or add any text or objects. Preserve all pixels outside the listed regions as closely as possible, preserve canvas aspect ratio and composition, and return only the cleaned image. Regions are normalized x,y,width,height boxes from the top-left: ${JSON.stringify(regions)}`
          }
        ]
      },
      config: { responseModalities: ['IMAGE'] }
    });
    if (signal.aborted) throw new Error('Analysis cancelled.');
    const imagePart = response.candidates?.flatMap((candidate) => candidate.content?.parts ?? [])
      .find((part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/'));
    if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
      return {
        status: 'unavailable',
        provider: this.name,
        value: null,
        message: 'The image model did not return a reconstructed background.'
      };
    }
    const bytes = Buffer.from(imagePart.inlineData.data, 'base64');
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) {
      return {
        status: 'unavailable',
        provider: this.name,
        value: null,
        message: 'The reconstructed background was empty or exceeded the 12 MB limit.'
      };
    }
    return {
      status: 'available',
      provider: this.name,
      value: { bytes, mimeType: imagePart.inlineData.mimeType }
    };
  }
}

export class GeminiQrProvider implements QrProvider {
  readonly name = 'gemini-qr';
  private readonly ai = makeAi();

  async detect(image: AnalysisImage, { signal }: ProviderContext): Promise<ProviderResult<QrCodeResult[]>> {
    if (!this.ai) return unavailable(this.name);
    const value = await askGemini<{ codes: QrCodeResult[] }>(
      this.ai,
      image,
      'Find visible QR codes and decode them if possible. Return JSON {codes:[{box:{x,y,width,height},value,confidence}]}. Coordinates are normalized 0..1. Use null for value when a QR is visible but its payload cannot be decoded. Return an empty codes array when none are visible.',
      signal
    );
    return { status: 'available', provider: this.name, value: value.codes };
  }
}

export class GeminiColorProvider implements ColorProvider {
  readonly name = 'gemini-colors';
  private readonly ai = makeAi();

  async extract(
    image: AnalysisImage,
    regions: VisionRegion[],
    { signal }: ProviderContext
  ): Promise<ProviderResult<ColorResult>> {
    if (!this.ai) return unavailable(this.name);
    const regionList = regions.map(({ label, box }) => ({ label, box }));
    const value = await askGemini<ColorResult>(
      this.ai,
      image,
      `Report visually observed colors only. Return JSON {palette:[hex],dominantColors:[hex],regions:[{box:{x,y,width,height},dominant:hex,palette:[hex]}]}. Include colors for these detected regions where identifiable: ${JSON.stringify(regionList)}. Use normalized 0..1 boxes. Limit global palette to 12 colors.`,
      signal
    );
    return { status: 'available', provider: this.name, value };
  }
}

export function createGeminiProviders(): {
  ocr: OcrProvider;
  vision: VisionProvider;
  segmentation: SegmentationProvider;
  qr: QrProvider;
  colors: ColorProvider;
  background: BackgroundReconstructionProvider;
} {
  return {
    ocr: new GeminiOcrProvider(),
    vision: new GeminiVisionProvider(),
    segmentation: new GeminiSegmentationProvider(),
    qr: new GeminiQrProvider(),
    colors: new GeminiColorProvider(),
    background: new GeminiBackgroundReconstructionProvider()
  };
}

export function isRegionKind(value: unknown): value is RegionKind {
  return ['person', 'product', 'logo', 'icon', 'photo', 'shape', 'other'].includes(String(value));
}
