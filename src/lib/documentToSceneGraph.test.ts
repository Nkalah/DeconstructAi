import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyDocument, validateDocument } from '../core/schema/designDocument';
import { documentToSceneGraph } from './documentToSceneGraph';
import { sceneGraphToDesignDocument } from './sceneGraphToDesignDocument';
import { applyMutation } from './sceneGraphMutations';

describe('DesignDocument canvas projection', () => {
  it('preserves all visible layer data through the editor scene projection', () => {
    const document = createEmptyDocument({ id: 'poster-1', width: 640, height: 800 });
    document.canvas.background = {
      type: 'gradient',
      gradient: {
        type: 'radial',
        angle: 45,
        stops: [
          { color: '#ffffff', offset: 0 },
          { color: '#336699', offset: 1 }
        ]
      }
    };
    document.assets['photo-asset'] = {
      id: 'photo-asset',
      mimeType: 'image/webp',
      uri: 'data:image/webp;base64,ZmFrZQ==',
      name: 'Product photo'
    };
    document.assets['qr-asset'] = {
      id: 'qr-asset',
      mimeType: 'image/png',
      uri: 'data:image/png;base64,ZmFrZQ==',
      name: 'QR crop'
    };
    document.layers = [
      {
        id: 'headline',
        type: 'text',
        name: 'Headline',
        x: 40,
        y: 30,
        width: 400,
        height: 90,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        locked: false,
        visible: true,
        source: { origin: 'ocr', originalBBox: { x: 40, y: 30, width: 400, height: 90 } },
        confidence: 0.7,
        needsReview: true,
        text: 'Editable headline',
        lineBreaks: [8],
        fontFamily: 'Inter',
        fontCandidates: [{ family: 'Inter', confidence: 0.8, category: 'sans-serif' }],
        fontSize: 48,
        fontWeight: 700,
        fontStyle: 'normal',
        direction: 'rtl',
        lineHeight: 1.2,
        letterSpacing: 0,
        align: 'center',
        fill: '#222222',
        stroke: { color: '#ffffff', width: 1 },
        shadow: null,
        effects: [],
        uncertain: true
      },
      {
        id: 'photo',
        type: 'image',
        name: 'Product photo',
        x: 100,
        y: 180,
        width: 300,
        height: 240,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        locked: false,
        visible: true,
        source: { origin: 'detector', originalBBox: { x: 100, y: 180, width: 300, height: 240 } },
        confidence: 0.9,
        needsReview: false,
        assetId: 'photo-asset',
        crop: null,
        maskShape: 'circle',
        objectFit: 'contain',
        backgroundRemoved: false,
        originalCropAssetId: null,
        effects: []
      },
      {
        id: 'banner',
        type: 'shape',
        name: 'Gradient banner',
        x: 20,
        y: 500,
        width: 500,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex: 4,
        locked: false,
        visible: true,
        source: { origin: 'detector', originalBBox: { x: 20, y: 500, width: 500, height: 100 } },
        confidence: 0.95,
        needsReview: false,
        shapeType: 'rect',
        fill: null,
        gradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { color: '#ff0000', offset: 0 },
            { color: '#0000ff', offset: 1 }
          ]
        },
        stroke: '#111111',
        strokeWidth: 2,
        cornerRadius: 8
      },
      {
        id: 'qr',
        type: 'qr',
        name: 'QR code',
        x: 500,
        y: 680,
        width: 80,
        height: 80,
        rotation: 0,
        opacity: 1,
        zIndex: 5,
        locked: false,
        visible: true,
        source: { origin: 'detector', originalBBox: { x: 500, y: 680, width: 80, height: 80 } },
        confidence: 0.99,
        needsReview: false,
        value: 'https://example.com',
        assetId: 'qr-asset',
        decodedOk: true,
        errorCorrection: 'M'
      },
      {
        id: 'group-1',
        type: 'group',
        name: 'Header group',
        x: 40,
        y: 30,
        width: 400,
        height: 90,
        rotation: 0,
        opacity: 1,
        zIndex: -1,
        locked: false,
        visible: true,
        source: { origin: 'user', originalBBox: null },
        confidence: null,
        needsReview: false,
        childIds: ['headline']
      }
    ];
    document.layers[0].groupId = 'group-1';

    const scene = documentToSceneGraph(document);
    const image = scene.layers.find((layer) => layer.id === 'photo');
    const shape = scene.layers.find((layer) => layer.id === 'banner');
    const qr = scene.layers.find((layer) => layer.id === 'qr');
    const text = scene.layers.find((layer) => layer.id === 'headline');
    const background = scene.layers.find((layer) => layer.type === 'background_fill');
    assert.equal(image?.type, 'image');
    assert.equal(image?.type === 'image' && image.type_specific.object_fit, 'contain');
    assert.equal(image?.type === 'image' && image.type_specific.mask_shape, 'circle');
    assert.equal(shape?.type, 'shape');
    assert.equal(shape?.style.effects.gradient?.type, 'linear');
    assert.equal(shape?.style.effects.stroke.enabled, true);
    assert.equal(qr?.type, 'icon');
    assert.equal(qr?.type === 'icon' && qr.type_specific.image_url, document.assets['qr-asset'].uri);
    assert.equal(text?.type === 'text' && text.type_specific.uncertain, true);
    assert.equal(text?.type === 'text' && text.type_specific.direction, 'rtl');
    assert.equal(background?.type === 'background_fill' && background.type_specific.fill_type, 'radial_gradient');

    const roundTripped = sceneGraphToDesignDocument(scene, document);
    const validation = validateDocument(roundTripped);
    const roundTrippedImage = roundTripped.layers.find((layer) => layer.id === 'photo');
    const roundTrippedShape = roundTripped.layers.find((layer) => layer.id === 'banner');
    const roundTrippedQr = roundTripped.layers.find((layer) => layer.id === 'qr');
    assert.equal(validation.success, true);
    assert.equal(roundTrippedImage?.type === 'image' && roundTrippedImage.objectFit, 'contain');
    assert.equal(roundTrippedImage?.type === 'image' && roundTrippedImage.maskShape, 'circle');
    assert.equal(roundTrippedShape?.type === 'shape' && roundTrippedShape.gradient?.type, 'linear');
    assert.equal(roundTrippedQr?.type === 'qr' && roundTrippedQr.value, 'https://example.com');
    assert.equal(roundTripped.layers.find((layer) => layer.id === 'group-1')?.type, 'group');
    assert.equal(roundTripped.assets['photo-asset'].mimeType, 'image/webp');
    assert.equal(roundTripped.layers.find((layer) => layer.id === 'headline')?.type === 'text'
      && roundTripped.layers.find((layer) => layer.id === 'headline')?.direction, 'rtl');

    const edited = applyMutation(scene, {
      type: 'update_text',
      layer_id: 'headline',
      params: { content: 'مرحبا\n世界', direction: 'rtl', font_size: 52, font_style: 'italic' }
    }).scene;
    const editedText = edited.layers.find((layer) => layer.id === 'headline');
    assert.equal(editedText?.type === 'text' && editedText.type_specific.content, 'مرحبا\n世界');
    assert.deepEqual(editedText?.type === 'text' && editedText.type_specific.line_breaks, [6]);
    assert.equal(editedText?.type === 'text' && editedText.type_specific.font_style, 'italic');
    assert.equal(editedText?.type === 'text' && editedText.type_specific.direction, 'rtl');
    assert.equal(editedText?.type === 'text' && editedText.type_specific.uncertain, false);
    assert.equal(text?.type === 'text' && text.type_specific.content, 'Editable headline');

    const styled = applyMutation(edited, {
      type: 'batch_mutation',
      description: 'Pasted text style',
      params: {
        mutations: [
          { type: 'update_text', layer_id: 'headline', params: { font_family: 'Lora', font_weight: 600 } },
          { type: 'set_color', layer_id: 'headline', params: { color: '#abcdef' } },
          { type: 'set_effect', layer_id: 'headline', params: { opacity: 0.7, stroke: { enabled: true, width: 2, color: '#123456' } } }
        ]
      }
    }).scene;
    const styledText = styled.layers.find((layer) => layer.id === 'headline');
    assert.equal(styledText?.type === 'text' && styledText.type_specific.font_family, 'Lora');
    assert.equal(styledText?.type === 'text' && styledText.type_specific.color, '#abcdef');
    assert.equal(styledText?.type === 'text' && styledText.style.effects.stroke.enabled, true);
    assert.equal(styledText?.opacity, 0.7);

    const reordered = applyMutation(scene, {
      type: 'reorder_layer',
      layer_id: 'headline',
      params: { new_z_index: 3 }
    }).scene;
    const orderedIds = reordered.layers
      .filter((layer) => layer.type !== 'background_fill')
      .sort((left, right) => left.z_index - right.z_index)
      .map((layer) => layer.id);
    assert.deepEqual(orderedIds.slice(0, 3), ['photo', 'banner', 'headline']);
    assert.equal(orderedIds.at(-1), 'qr');

    const movedToFront = applyMutation(reordered, {
      type: 'reorder_layer',
      layer_id: 'photo',
      params: { new_z_index: reordered.layers.filter((layer) => layer.type !== 'background_fill').length }
    }).scene;
    assert.equal(
      movedToFront.layers.find((layer) => layer.id === 'photo')?.z_index,
      movedToFront.layers.filter((layer) => layer.type !== 'background_fill').length,
    );

    const droppedAfter = applyMutation(scene, {
      type: 'reorder_layer',
      layer_id: 'headline',
      params: { after_layer_id: 'banner', new_z_index: 1 }
    }).scene;
    assert.deepEqual(
      droppedAfter.layers
        .filter((layer) => layer.type !== 'background_fill')
        .sort((left, right) => left.z_index - right.z_index)
        .map((layer) => layer.id)
        .slice(0, 3),
      ['photo', 'banner', 'headline'],
    );

    const renamed = applyMutation(movedToFront, {
      type: 'rename_layer',
      layer_id: 'photo',
      params: { name: 'Hero artwork' }
    }).scene;
    assert.equal(renamed.layers.find((layer) => layer.id === 'photo')?.name, 'Hero artwork');
  });

  it('keeps transparent canvases transparent', () => {
    const document = createEmptyDocument({ id: 'transparent-1' });
    document.canvas.background = { type: 'transparent' };
    const scene = documentToSceneGraph(document);
    assert.equal(scene.canvas.background_color, null);
    assert.equal(scene.layers[0].type === 'background_fill' && scene.layers[0].type_specific.fill_type, 'transparent');
    assert.deepEqual(sceneGraphToDesignDocument(scene, document).canvas.background, { type: 'transparent' });
  });
});
