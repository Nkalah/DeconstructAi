import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createEmptyDocument,
  deserializeDocument,
  migrateDocument,
  serializeDocument,
  validateDocument,
  type TextDesignLayer,
} from './designDocument';

const textLayer: TextDesignLayer = {
  id: 'text-title',
  type: 'text',
  name: 'Title',
  x: 20,
  y: 30,
  width: 500,
  height: 100,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  locked: false,
  visible: true,
  source: { origin: 'ocr', originalBBox: { x: 20, y: 30, width: 500, height: 100 } },
  confidence: 0.91,
  needsReview: false,
  text: 'A title',
  fontFamily: 'Inter',
  fontSize: 48,
  fontWeight: 700,
  fontStyle: 'normal',
  lineHeight: 1.2,
  letterSpacing: 0,
  align: 'left',
  fill: '#111111',
  stroke: null,
  shadow: null,
  effects: [],
  uncertain: false,
};

describe('DesignDocument schema', () => {
  it('creates a valid empty document with expected defaults', () => {
    const document = createEmptyDocument({
      id: 'design-1',
      name: 'New poster',
      now: '2026-10-02T00:00:00.000Z',
    });

    assert.equal(validateDocument(document).success, true);
    assert.deepEqual(document.layers, []);
    assert.equal(document.originalAsset, null);
    assert.deepEqual(document.canvas.background, { type: 'solid', color: '#ffffff' });
  });

  it('rejects invalid confidence and opacity values', () => {
    const document = createEmptyDocument({ id: 'design-2' });
    document.layers.push({ ...textLayer, confidence: 1.1 });

    const result = validateDocument(document);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues.some((issue) => issue.path.includes('confidence')), true);
    }
  });

  it('round-trips a populated document through JSON without loss', () => {
    const document = createEmptyDocument({
      id: 'design-3',
      now: '2026-10-02T00:00:00.000Z',
    });
    document.layers.push({ ...textLayer, effects: [{ type: 'outline', enabled: true, params: { spread: 2 } }] });
    document.assets['asset-1'] = {
      id: 'asset-1',
      mimeType: 'image/png',
      uri: 'data:image/png;base64,AA==',
      name: 'poster.png',
    };
    document.originalAsset = { assetId: 'asset-1' };
    document.analysis = {
      status: 'partial',
      provider: 'gemini',
      analyzedAt: '2026-10-02T00:00:00.000Z',
      stages: [{ name: 'OCR', status: 'completed' }],
      warnings: ['Review title text'],
    };

    assert.deepEqual(deserializeDocument(serializeDocument(document)), document);
  });

  it('migrates schema version zero and rejects unsupported future versions', () => {
    const document = createEmptyDocument({ id: 'design-4' });
    const oldDocument = { ...document, schemaVersion: 0 };
    assert.equal(migrateDocument(oldDocument).schemaVersion, 1);
    assert.throws(() => migrateDocument({ ...document, schemaVersion: 2 }), /version 2/);
  });
});
