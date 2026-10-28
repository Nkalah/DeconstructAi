import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyDocument } from '../core/schema/designDocument';
import { documentToSceneGraph } from './documentToSceneGraph';
import { renderSceneToSvgString } from './sceneSvgRenderer';

describe('off-screen scene rendering', () => {
  it('renders editable text and generated QR images into the comparison SVG', () => {
    const document = createEmptyDocument({ id: 'comparison-render', width: 320, height: 480 });
    document.assets.qr = {
      id: 'qr',
      mimeType: 'image/png',
      uri: 'data:image/png;base64,cXJjb2Rl',
      name: 'Generated QR'
    };
    document.layers = [
      {
        id: 'title',
        type: 'text',
        name: 'Title',
        x: 20,
        y: 30,
        width: 250,
        height: 60,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        locked: false,
        visible: true,
        source: { origin: 'ocr', originalBBox: null },
        confidence: 0.6,
        needsReview: true,
        text: 'Editable title',
        fontFamily: 'Arial',
        fontSize: 32,
        fontWeight: 700,
        fontStyle: 'normal',
        lineHeight: 1.2,
        letterSpacing: 0,
        align: 'left',
        fill: '#111111',
        stroke: null,
        shadow: null,
        effects: [],
        uncertain: false
      },
      {
        id: 'gradient',
        type: 'shape',
        name: 'Gradient panel',
        x: 0,
        y: 100,
        width: 320,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        locked: false,
        visible: true,
        source: { origin: 'user', originalBBox: null },
        confidence: 1,
        needsReview: false,
        shapeType: 'rect',
        fill: '#ffffff',
        gradient: null,
        stroke: null,
        strokeWidth: 0,
        cornerRadius: 0
      },
      {
        id: 'qr-layer',
        type: 'qr',
        name: 'QR code',
        x: 230,
        y: 380,
        width: 60,
        height: 60,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        locked: false,
        visible: true,
        source: { origin: 'detector', originalBBox: null },
        confidence: 0.9,
        needsReview: false,
        value: 'https://example.test',
        assetId: 'qr',
        decodedOk: true,
        errorCorrection: 'H'
      }
    ];

    const scene = documentToSceneGraph(document);
    const svg = renderSceneToSvgString(scene);

    assert.match(svg, /Editable title/);
    assert.match(svg, /data:image\/png;base64,cXJjb2Rl/);
    assert.match(svg, /<image href=/);
  });
});
