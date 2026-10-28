import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateDocument } from '../../src/core/schema/designDocument.js';
import { documentToSceneGraph } from '../../src/lib/documentToSceneGraph.js';
import { applyMutation } from '../../src/lib/sceneGraphMutations.js';
import { clearAnalysisCache, createAnalysisImage, getAnalysisCacheSize, runModularAnalysis } from './pipeline.js';
import type { AnalysisProviders, ProviderResult } from './types.js';

const image = createAnalysisImage(
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
  'image/png',
  800,
  1000
);

function makeProviders(overrides: Partial<AnalysisProviders> = {}) {
  let calls = { ocr: 0, vision: 0, segmentation: 0, qr: 0, colors: 0, background: 0 };
  const providers: AnalysisProviders = {
    ocr: {
      name: 'mock-ocr',
      recognize: async (analysisImage) => {
        calls.ocr += 1;
        if (analysisImage.bytes[8] === 42) {
          return { status: 'available', provider: 'mock-ocr', value: { blocks: [] } };
        }
        return {
          status: 'available',
          provider: 'mock-ocr',
          value: {
            blocks: [
              { text: 'Title', box: { x: 0.2, y: 0.1, width: 0.6, height: 0.08 }, lineBreaks: [], language: 'en', confidence: 0.96 },
              { text: 'Subtitle', box: { x: 0.22, y: 0.2, width: 0.56, height: 0.05 }, lineBreaks: [], language: 'en', confidence: 0.9 }
            ]
          }
        };
      }
    },
    vision: {
      name: 'mock-vision',
      analyze: async (analysisImage) => {
        calls.vision += 1;
        if (analysisImage.bytes[8] === 42) {
          return { status: 'available', provider: 'mock-vision', value: { regions: [], shapes: [], layoutDescription: 'Clean background.' } };
        }
        return {
          status: 'available',
          provider: 'mock-vision',
          value: {
            regions: [{
              label: 'Product photo',
              kind: 'photo',
              box: { x: 0.1, y: 0.3, width: 0.8, height: 0.5 },
              confidence: 0.88,
              description: 'A product photograph.'
            }],
            shapes: [{
              label: 'Divider',
              shapeType: 'line',
              box: { x: 0.1, y: 0.27, width: 0.8, height: 0.002 },
              fill: null,
              stroke: '#000000',
              strokeWidth: 2,
              confidence: 0.83
            }],
            layoutDescription: 'Title above a product photo.'
          }
        };
      }
    },
    segmentation: {
      name: 'mock-segmentation',
      segment: async () => {
        calls.segmentation += 1;
        return {
          status: 'available',
          provider: 'mock-segmentation',
          value: {
            foregroundMask: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="black"/><polygon points="30,30 220,30 220,220 30,220" fill="white"/></svg>')}`,
            backgroundMask: '',
            box: { x: 0.1, y: 0.3, width: 0.8, height: 0.5 }
          }
        };
      }
    },
    qr: {
      name: 'mock-qr',
      detect: async (analysisImage) => {
        calls.qr += 1;
        if (analysisImage.bytes[8] === 42) return { status: 'available', provider: 'mock-qr', value: [] };
        return {
          status: 'available',
          provider: 'mock-qr',
          value: [{ box: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 }, value: 'https://example.test', confidence: 0.99 }]
        };
      }
    },
    background: {
      name: 'mock-background',
      reconstruct: async () => {
        calls.background += 1;
        return {
          status: 'available',
          provider: 'mock-background',
          value: {
            bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 42]),
            mimeType: 'image/png'
          }
        };
      }
    },
    colors: {
      name: 'mock-colors',
      extract: async () => {
        calls.colors += 1;
        return {
          status: 'available',
          provider: 'mock-colors',
          value: {
            palette: ['#123456', '#abcdef'],
            dominantColors: ['#123456'],
            regions: [{ box: { x: 0.1, y: 0.3, width: 0.8, height: 0.5 }, dominant: '#abcdef', palette: ['#abcdef'] }]
          }
        };
      }
    },
    ...overrides
  };
  return { providers, calls };
}

describe('modular analysis providers', () => {
  it('runs mocked adapters for every provider and creates a valid DesignDocument', async () => {
    clearAnalysisCache();
    const { providers, calls } = makeProviders();
    const result = await runModularAnalysis({
      image,
      designId: 'mock-design',
      designName: 'Mock poster',
      originalAssetId: 'original-1',
      providers
    });

    assert.equal(validateDocument(result.document).success, true);
    assert.equal(calls.ocr, 2);
    assert.equal(calls.vision, 2);
    assert.equal(calls.segmentation, 1);
    assert.equal(calls.qr, 2);
    assert.equal(calls.colors, 1);
    assert.equal(calls.background, 1);
    assert.equal(result.document.originalAsset?.assetId, 'original-1');
    assert.equal(result.document.layers.some((layer) => layer.type === 'text'), true);
    assert.equal(result.document.layers.some((layer) => layer.type === 'qr'), true);
    assert.equal(
      result.document.layers.some((layer) => layer.type === 'image' && layer.source.origin === 'detector' && layer.needsReview),
      true
    );
    assert.equal(result.document.analysis.warnings.some((warning) => warning.includes('single raster-only layer')), false);
    const detectedImage = result.document.layers.find((layer) => layer.type === 'image' && layer.source.origin === 'detector');
    assert.equal(detectedImage?.type === 'image' && detectedImage.backgroundRemoved, false);
    assert.equal(detectedImage?.type === 'image' && detectedImage.segmentationMaskAssetId, undefined);
    assert.equal(detectedImage?.type === 'image' && detectedImage.locked, true);
    assert.ok(detectedImage?.name.includes('Raster — not fully editable'));
    assert.ok(result.document.assets[`clean-background-${result.document.id}`]);
    assert.equal(
      result.document.layers.some((layer) =>
        layer.type === 'image'
        && layer.source.origin === 'fallback'
        && layer.assetId === `clean-background-${result.document.id}`
      ),
      true
    );
    assert.equal(Boolean(result.document.assets['foreground-region-1']), true);
    assert.equal(detectedImage?.type === 'image' && detectedImage.segmentationMaskAssetId, 'foreground-region-1');
    assert.equal(detectedImage?.type === 'image' && detectedImage.locked, false);
    const scene = documentToSceneGraph(result.document);
    const background = scene.layers.find((layer) => layer.type === 'image' && layer.id === 'image-background-fallback');
    const originalBackgroundUrl = background?.type === 'image' ? background.type_specific.image_url : null;
    const editableText = scene.layers.find((layer) => layer.type === 'text');
    assert.ok(background?.type === 'image');
    assert.equal(originalBackgroundUrl, result.document.assets[`clean-background-${result.document.id}`].uri);
    assert.notEqual(originalBackgroundUrl, scene.original_image_url);
    if (editableText?.type === 'text' && background?.type === 'image') {
      const changedText = applyMutation(scene, {
        type: 'update_text',
        layer_id: editableText.id,
        params: { content: 'Replaced heading' }
      }).scene;
      assert.equal(changedText.layers.find((layer) => layer.id === editableText.id)?.type === 'text'
        ? (changedText.layers.find((layer) => layer.id === editableText.id) as Extract<typeof editableText, { type: 'text' }>).type_specific.content
        : null, 'Replaced heading');
      assert.equal(changedText.layers.find((layer) => layer.id === background.id)?.type === 'image'
        ? (changedText.layers.find((layer) => layer.id === background.id) as Extract<typeof background, { type: 'image' }>).type_specific.image_url
        : null, originalBackgroundUrl);
      const deletedText = applyMutation(changedText, { type: 'delete_layer', layer_id: editableText.id, params: {} }).scene;
      assert.equal(deletedText.layers.some((layer) => layer.id === editableText.id), false);
      assert.ok(deletedText.layers.some((layer) => layer.id === background.id));
    }
    assert.equal(result.document.layers.some((layer) => layer.type === 'group'), true);
    assert.deepEqual(result.stageReport.map((stage) => stage.name), [
      'validate', 'normalize', 'OCR', 'regions', 'colors', 'shapes/lines', 'QR', 'background reconstruction',
      'grouping', 'layer ordering', 'reconstruct', 'confidence scoring'
    ]);
  });

  it('continues after an independently failed provider stage', async () => {
    clearAnalysisCache();
    const { providers, calls } = makeProviders({
      ocr: {
        name: 'failing-ocr',
        recognize: async (): Promise<ProviderResult<never>> => { throw new Error('OCR service unavailable'); }
      }
    });
    const result = await runModularAnalysis({
      image,
      designId: 'failed-ocr',
      designName: 'Failure',
      originalAssetId: 'failed-ocr-original',
      providers
    });

    assert.equal(result.stageReport.find((stage) => stage.name === 'OCR')?.status, 'failed');
    assert.equal(result.stageReport.find((stage) => stage.name === 'regions')?.status, 'completed');
    assert.equal(result.stageReport.find((stage) => stage.name === 'confidence scoring')?.status, 'completed');
    assert.equal(calls.vision, 2);
    assert.equal(validateDocument(result.document).success, true);
    assert.ok(result.document.layers.some((layer) => layer.type === 'image' && layer.source.origin === 'fallback'));
    assert.equal(result.document.originalAsset?.assetId, 'failed-ocr-original');
    assert.ok(result.document.analysis.warnings.some((warning) => warning.includes('OCR failed')));
  });

  it('reconstructs detected text while retaining the original when object detection fails', async () => {
    clearAnalysisCache();
    const { providers } = makeProviders({
      vision: {
        name: 'failing-vision',
        analyze: async (): Promise<ProviderResult<never>> => { throw new Error('Object detection unavailable'); }
      }
    });
    const result = await runModularAnalysis({
      image,
      designId: 'failed-object-detection',
      designName: 'Fallback poster',
      originalAssetId: 'fallback-original',
      providers
    });
    const originalLayer = result.document.layers.find((layer) => layer.type === 'image' && layer.source.origin === 'fallback');

    assert.equal(result.stageReport.find((stage) => stage.name === 'regions')?.status, 'failed');
    assert.ok(originalLayer);
    assert.equal(originalLayer?.type === 'image' && originalLayer.assetId, 'clean-background-failed-object-detection');
    assert.equal(result.document.originalAsset?.assetId, 'fallback-original');
    assert.ok(result.document.analysis.warnings.some((warning) => warning.includes('regions failed')));
    assert.equal(validateDocument(result.document).success, true);
  });

  it('offers closest fonts and marks text for review when font detection throws', async () => {
    clearAnalysisCache();
    const { providers } = makeProviders();
    const result = await runModularAnalysis({
      image,
      designId: 'failed-font-detection',
      designName: 'Font fallback',
      providers,
      fontMatcher: () => { throw new Error('simulated font detector failure'); }
    });
    const text = result.document.layers.find((layer) => layer.type === 'text');

    assert.equal(text?.type === 'text' && text.uncertain, true);
    assert.deepEqual(
      text?.type === 'text' && text.fontCandidates?.map((candidate) => candidate.family),
      ['Montserrat', 'Inter', 'Open Sans']
    );
    assert.ok(text?.source.warning_flags?.includes('font_detection_failed'));
    assert.ok(result.document.analysis.warnings.some((warning) => warning.includes('closest fallback fonts')));
  });

  it('reports unconfigured providers as unavailable and continues', async () => {
    clearAnalysisCache();
    const unavailable = <T,>(name: string) => ({
      status: 'unavailable' as const,
      provider: name,
      value: null,
      message: 'Not configured.'
    });
    const { providers } = makeProviders({
      ocr: { name: 'off-ocr', recognize: async () => unavailable('off-ocr') },
      vision: { name: 'off-vision', analyze: async () => unavailable('off-vision') },
      colors: { name: 'off-colors', extract: async () => unavailable('off-colors') },
      qr: { name: 'off-qr', detect: async () => unavailable('off-qr') },
      segmentation: { name: 'off-seg', segment: async () => unavailable('off-seg') }
    });
    const result = await runModularAnalysis({ image, designId: 'unavailable', designName: 'Unavailable', providers });

    assert.equal(result.stageReport.find((stage) => stage.name === 'OCR')?.status, 'skipped');
    assert.equal(result.stageReport.find((stage) => stage.name === 'regions')?.status, 'skipped');
    assert.equal(result.document.analysis.status, 'partial');
    assert.equal(result.document.analysis.warnings.length > 0, true);
    assert.equal(validateDocument(result.document).success, true);
  });

  it('reports optional segmentation as unavailable without fabricating masks', async () => {
    clearAnalysisCache();
    const { providers } = makeProviders({
      segmentation: {
        name: 'off-segmentation',
        segment: async () => ({
          status: 'unavailable',
          provider: 'off-segmentation',
          value: null,
          message: 'No mask model configured.'
        })
      }
    });
    const result = await runModularAnalysis({
      image,
      designId: 'no-segmentation',
      designName: 'No segmentation',
      providers
    });

    assert.match(result.stageReport.find((stage) => stage.name === 'regions')?.message ?? '', /Segmentation unavailable/);
    assert.match(result.stageReport.find((stage) => stage.name === 'regions')?.message ?? '', /foreground masks are not applied/);
    assert.equal(result.document.analysis.warnings.some((warning) => warning.includes('segmentation unavailable')), true);
    assert.equal(result.document.analysis.warnings.some((warning) => warning.includes('Raster — not fully editable')), true);
    assert.ok(result.document.layers.some((layer) =>
      layer.type === 'image'
      && layer.source.origin === 'detector'
      && layer.locked
      && layer.name.includes('Raster — not fully editable')
    ));
    assert.ok(result.document.layers.some((layer) => layer.type === 'image' && layer.source.origin === 'fallback'));
    assert.equal(validateDocument(result.document).success, true);
  });

  it('withholds editable overlays when OCR finds text remaining in the reconstructed background', async () => {
    clearAnalysisCache();
    const { providers } = makeProviders({
      ocr: {
        name: 'residual-text-ocr',
        recognize: async (analysisImage) => ({
          status: 'available',
          provider: 'residual-text-ocr',
          value: {
            blocks: [{ text: 'Title', box: { x: 0.2, y: 0.1, width: 0.6, height: 0.08 }, lineBreaks: [], language: 'en', confidence: 0.99 }]
          }
        })
      }
    });
    const result = await runModularAnalysis({
      image,
      designId: 'residual-text',
      designName: 'Residual text',
      providers
    });

    assert.equal(result.stageReport.find((stage) => stage.name === 'background reconstruction')?.status, 'skipped');
    assert.equal(result.document.layers.filter((layer) => layer.type !== 'group').length, 1);
    assert.equal(result.document.layers.some((layer) => layer.type === 'text'), false);
    assert.equal(result.document.assets[`clean-background-${result.document.id}`], undefined);
    assert.ok(result.document.analysis.warnings.some((warning) => warning.includes('Text may remain')));
  });

  it('withholds QR overlays when the cleaned background still contains a QR code', async () => {
    clearAnalysisCache();
    const { providers } = makeProviders({
      qr: {
        name: 'low-confidence-qr',
        detect: async () => ({
          status: 'available',
          provider: 'low-confidence-qr',
          value: [{ box: { x: 0.7, y: 0.72, width: 0.18, height: 0.18 }, value: 'https://untrusted.example', confidence: 0.42 }]
        })
      }
    });
    const result = await runModularAnalysis({
      image,
      designId: 'qr-fallback-design',
      designName: 'QR fallback',
      originalAssetId: 'qr-fallback-original',
      providers
    });
    const qr = result.document.layers.find((layer) => layer.type === 'qr');
    assert.equal(validateDocument(result.document).success, true);
    assert.equal(qr, undefined);
    assert.equal(result.stageReport.find((stage) => stage.name === 'background reconstruction')?.status, 'skipped');
    assert.ok(result.document.layers.some((layer) => layer.type === 'image' && layer.source.origin === 'fallback'));
  });

  it('caches successful provider outputs using the image hash', async () => {
    clearAnalysisCache();
    const first = makeProviders();
    await runModularAnalysis({ image, designId: 'cache-1', designName: 'Cache 1', providers: first.providers });
    const second = makeProviders();
    const result = await runModularAnalysis({ image, designId: 'cache-2', designName: 'Cache 2', providers: second.providers });

    assert.deepEqual(second.calls, { ocr: 1, vision: 1, segmentation: 0, qr: 1, colors: 0, background: 1 });
    assert.equal(result.document.analysis.warnings.some((warning) => warning.includes('image-hash cache')), true);
    assert.equal(getAnalysisCacheSize(), 1);
  });

  it('reconstructs three distinct poster layouts with names, groups, and review state', async () => {
    const posters = [
      {
        name: 'Conference',
        text: [
          { text: 'DESIGN SUMMIT', box: { x: 0.15, y: 0.08, width: 0.7, height: 0.1 }, lineBreaks: [], language: 'en', confidence: 0.98, fontFamilyHint: 'Montserrat', fontStyle: 'sans-serif' as const, fontStyleConfidence: 0.9, estimatedFontSize: 82, estimatedWeight: 800, alignment: 'center' as const },
          { text: 'October 12', box: { x: 0.3, y: 0.2, width: 0.4, height: 0.05 }, lineBreaks: [], language: 'en', confidence: 0.92, fontStyle: 'serif' as const, fontStyleConfidence: 0.86 }
        ],
        regions: [{ label: 'Stage speaker', kind: 'person' as const, box: { x: 0.2, y: 0.35, width: 0.6, height: 0.45 }, confidence: 0.91, description: 'Speaker portrait.' }]
      },
      {
        name: 'Cafe menu',
        text: [
          { text: 'TODAY’S MENU', box: { x: 0.12, y: 0.06, width: 0.76, height: 0.08 }, lineBreaks: [], language: 'en', confidence: 0.9, fontStyle: 'display' as const, isCondensed: true },
          { text: 'EspressoLatte', box: { x: 0.12, y: 0.32, width: 0.5, height: 0.16 }, lineBreaks: [8], language: 'en', confidence: 0.82, fontStyle: 'serif' as const }
        ],
        regions: [{ label: 'Coffee cup', kind: 'product' as const, box: { x: 0.52, y: 0.3, width: 0.4, height: 0.45 }, confidence: 0.87, description: 'Coffee product photo.' }]
      },
      {
        name: 'Home services',
        text: [
          { text: 'HOME REPAIR', box: { x: 0.1, y: 0.1, width: 0.8, height: 0.12 }, lineBreaks: [], language: 'en', confidence: 0.96, fontFamilyHint: 'Anton', fontStyle: 'display' as const, fontStyleConfidence: 0.92, estimatedWeight: 900 },
          { text: '+1 555 123 4567', box: { x: 0.2, y: 0.84, width: 0.6, height: 0.06 }, lineBreaks: [], language: 'en', confidence: 0.41 }
        ],
        regions: [{ label: 'Tool illustration', kind: 'other' as const, box: { x: 0.25, y: 0.35, width: 0.5, height: 0.35 }, confidence: 0.61, description: 'An unclassified tool illustration.' }]
      }
    ];

    for (const [index, poster] of posters.entries()) {
      clearAnalysisCache();
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, index + 20]);
      const { providers } = makeProviders({
        ocr: {
          name: `mock-${poster.name}-ocr`,
          recognize: async (analysisImage) => ({
            status: 'available',
            provider: `mock-${poster.name}-ocr`,
            value: { blocks: analysisImage.bytes[8] === 42 ? [] : poster.text }
          })
        },
        vision: {
          name: `mock-${poster.name}-vision`,
          analyze: async (analysisImage) => ({
            status: 'available',
            provider: `mock-${poster.name}-vision`,
            value: {
              regions: analysisImage.bytes[8] === 42 ? [] : poster.regions,
              shapes: analysisImage.bytes[8] === 42 ? [] : [{ label: 'Banner', shapeType: 'rect', box: { x: 0.08, y: 0.03, width: 0.84, height: 0.18 }, fill: '#123456', stroke: null, strokeWidth: 0, confidence: 0.85 }],
              background: { type: 'gradient', colors: ['#123456', '#abcdef'], angle: 135, confidence: 0.91 },
              layoutDescription: `${poster.name} poster layout.`
            }
          })
        }
      });
      const result = await runModularAnalysis({
        image: createAnalysisImage(png, 'image/png', 800, 1000),
        designId: `poster-${index}`,
        designName: poster.name,
        originalAssetId: `original-${index}`,
        providers
      });

      assert.equal(validateDocument(result.document).success, true, poster.name);
      assert.equal(result.document.canvas.background.type, 'gradient', poster.name);
      assert.equal(result.document.layers.some((layer) => layer.type === 'image'), true, poster.name);
      assert.equal(result.document.layers.some((layer) => layer.type === 'group'), true, poster.name);
      assert.equal(result.document.layers.some((layer) => layer.type === 'text' && layer.fontCandidates?.length === 3), true, poster.name);
      const posterText = result.document.layers.find((layer) => layer.type === 'text' && layer.text.includes('Espresso'));
      if (poster.name === 'Cafe menu') {
        assert.equal(posterText?.type === 'text' && posterText.text, 'Espresso\nLatte');
        assert.deepEqual(posterText?.type === 'text' && posterText.lineBreaks, [8]);
      }
      if (poster.name === 'Home services') {
        const phone = result.document.layers.find((layer) => layer.type === 'text' && layer.text.includes('555'));
        assert.equal(phone?.type === 'text' && phone.name, 'Phone number');
        assert.equal(result.document.layers.some((layer) => layer.type === 'image' && layer.name.includes('Unclassified artwork') && layer.needsReview), true);
      }
    }

    const uncertainPoster = posters[2];
    const { providers } = makeProviders({
      ocr: {
        name: 'uncertain',
        recognize: async () => ({ status: 'available', provider: 'uncertain', value: { blocks: uncertainPoster.text } })
      }
    });
    const lowConfidence = await runModularAnalysis({
      image: createAnalysisImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 99]), 'image/png', 800, 1000),
      designId: 'uncertain-poster',
      designName: 'Uncertain poster',
      providers
    });
    const lowConfidenceText = lowConfidence.document.layers.find((layer) => layer.type === 'text' && layer.text.includes('555'));
    assert.equal(lowConfidenceText?.type === 'text' && lowConfidenceText.uncertain, true);
    assert.equal(lowConfidenceText?.type === 'text' && lowConfidenceText.needsReview, true);
    assert.equal(lowConfidenceText?.type === 'text' && lowConfidenceText.text.includes('555'), true);
  });

  it('marks subsequent stages skipped when cancellation is requested', async () => {
    clearAnalysisCache();
    const controller = new AbortController();
    const { providers } = makeProviders({
      ocr: {
        name: 'cancel-after-ocr',
        recognize: async (_image, context) => {
          controller.abort();
          assert.equal(context.signal.aborted, true);
          return { status: 'available', provider: 'cancel-after-ocr', value: { blocks: [] } };
        }
      }
    });
    const result = await runModularAnalysis({
      image,
      designId: 'cancelled',
      designName: 'Cancelled',
      providers,
      signal: controller.signal
    });

    assert.equal(result.status, 'cancelled');
    assert.equal(result.stageReport.find((stage) => stage.name === 'regions')?.status, 'skipped');
    assert.equal(validateDocument(result.document).success, true);
  });
});
