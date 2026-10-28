import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyDocument, DesignLayerSchema } from '../core/schema/designDocument';
import { documentToSceneGraph } from './documentToSceneGraph';
import {
  buildExportScene,
  getExportDimensions,
  getRasterLimitations,
  getSvgLimitations,
  renderExportPreview,
  validateExportDimensions
} from './designExport';
import { renderSceneToSvgString } from './sceneSvgRenderer';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';

function multiLayerScene() {
  const document = createEmptyDocument({ id: 'multi-layer-export', width: 600, height: 900 });
  document.assets.posterImage = {
    id: 'posterImage',
    mimeType: 'image/png',
    uri: ONE_PIXEL_PNG,
    name: 'Portrait'
  };
  document.layers = [
    DesignLayerSchema.parse({
      id: 'background',
      type: 'shape',
      name: 'Base panel',
      x: 0,
      y: 0,
      width: 600,
      height: 900,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      source: { origin: 'user', originalBBox: null },
      confidence: null,
      needsReview: false,
      shapeType: 'rect',
      fill: '#f0e8d8',
      gradient: null,
      stroke: null,
      strokeWidth: 0,
      cornerRadius: 0
    }),
    DesignLayerSchema.parse({
      id: 'portrait',
      type: 'image',
      name: 'Portrait',
      x: 310,
      y: 160,
      width: 220,
      height: 260,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      locked: false,
      visible: true,
      source: { origin: 'user', originalBBox: null },
      confidence: null,
      needsReview: false,
      assetId: 'posterImage',
      crop: null,
      objectFit: 'cover',
      backgroundRemoved: false,
      originalCropAssetId: null,
      effects: []
    }),
    DesignLayerSchema.parse({
      id: 'heading',
      type: 'text',
      name: 'Heading',
      x: 44,
      y: 70,
      width: 490,
      height: 75,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      locked: false,
      visible: true,
      source: { origin: 'user', originalBBox: null },
      confidence: null,
      needsReview: false,
      text: 'Summer Festival',
      fontFamily: 'Arial',
      fontSize: 48,
      fontWeight: 700,
      fontStyle: 'normal',
      lineHeight: 1.2,
      letterSpacing: 0,
      align: 'center',
      fill: '#183153',
      stroke: null,
      shadow: null,
      effects: [],
      uncertain: false
    })
  ];
  return documentToSceneGraph(document);
}

describe('design export preparation', () => {
  it('computes original, social, and print output dimensions for supported resolutions', () => {
    const scene = multiLayerScene();
    assert.deepEqual(
      [getExportDimensions(scene, 'original', '2x').width, getExportDimensions(scene, 'original', '2x').height],
      [1200, 1800]
    );
    assert.deepEqual(
      [getExportDimensions(scene, 'instagram-post', '1x').width, getExportDimensions(scene, 'instagram-post', '1x').height],
      [1080, 1080]
    );
    assert.deepEqual(
      [getExportDimensions(scene, 'whatsapp-status', '3x').width, getExportDimensions(scene, 'whatsapp-status', '3x').height],
      [3240, 5760]
    );
    const a4 = getExportDimensions(scene, 'a4', '300dpi');
    assert.deepEqual([a4.width, a4.height, a4.dpi], [2480, 3508, 300]);
    assert.deepEqual([a4.physicalWidthMm, a4.physicalHeightMm], [210, 297]);
    assert.throws(() => getExportDimensions(scene, 'a5', '2x'), /150 DPI or 300 DPI/);
  });

  it('scales and centers every layer while preserving the artwork and alpha background option', () => {
    const scene = multiLayerScene();
    const dimensions = getExportDimensions(scene, 'instagram-story', '1x');
    const exportScene = buildExportScene(scene, dimensions, true);

    assert.equal(exportScene.canvas.width, 1080);
    assert.equal(exportScene.canvas.height, 1920);
    assert.equal(exportScene.canvas.background_color, null);
    assert.equal(exportScene.layers.length, scene.layers.filter((layer) => layer.type !== 'background_fill').length);
    const title = exportScene.layers.find((layer) => layer.id === 'heading');
    assert.equal(title?.type === 'text' ? title.type_specific.content : '', 'Summer Festival');
    assert.equal(title?.transform.x, 44 * 1.8 + 0);
    assert.equal(title?.transform.y, 70 * 1.8 + 150);
    assert.equal(title?.type === 'text' ? title.type_specific.font_size : 0, 86.4);
    validateExportDimensions(dimensions);
  });

  it('exports a layered SVG only when every visible layer has a supported vector representation', () => {
    const scene = multiLayerScene();
    assert.match(getSvgLimitations(scene).join(' '), /raster image/);
    const vectorScene = {
      ...scene,
      layers: scene.layers.filter((layer) => layer.type !== 'image')
    };
    assert.deepEqual(getSvgLimitations(vectorScene), []);
    const preview = renderExportPreview(vectorScene, {
      format: 'svg',
      preset: 'original',
      resolution: '1x',
      transparent: false
    });
    assert.match(preview, /^data:image\/svg\+xml/);
    const svg = renderSceneToSvgString(vectorScene);
    assert.match(svg, /Summer Festival/);
    assert.match(svg, /#f0e8d8/);
  });

  it('escapes user-provided SVG color attributes before export', () => {
    const scene = multiLayerScene();
    const title = scene.layers.find((layer) => layer.type === 'text');
    assert.ok(title?.type === 'text');
    title.type_specific.color = '#000000" onload="alert(1)';

    const svg = renderSceneToSvgString(scene);
    assert.match(svg, /fill="#000000&quot; onload=&quot;alert\(1\)"/);
    assert.doesNotMatch(svg, /fill="#000000" onload=/);
  });

  it('rejects dimensions outside the browser canvas limits', () => {
    assert.throws(() => validateExportDimensions({
      width: 40_000,
      height: 40_000,
      dpi: 300,
      physicalWidthMm: 210,
      physicalHeightMm: 297
    }), /too large/);
  });

  it('reports render blockers instead of exporting unsupported custom geometry', () => {
    const scene = multiLayerScene();
    const image = scene.layers.find((layer) => layer.type === 'image');
    assert.ok(image?.type === 'image');
    image.type_specific.mask_shape = 'custom_path';
    assert.match(getRasterLimitations(scene).join(' '), /custom mask/);
  });
});
