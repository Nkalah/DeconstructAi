import {
  createEmptyDocument,
  validateDocument,
  type DesignDocument,
  type DesignLayer
} from '../core/schema/designDocument';
import type {
  BackgroundFillLayer,
  ImageLayer,
  IconLayer,
  Layer,
  SceneGraph,
  ShapeLayer,
  TextLayer
} from '../types/sceneGraph';

function sourceFor(layer: Layer): DesignLayer['source'] {
  return {
    origin: layer.source.extraction_method === 'ocr'
      ? 'ocr'
      : layer.source.extraction_method === 'user_added'
        ? 'user'
        : 'detector',
    originalBBox: {
      x: layer.transform.x,
      y: layer.transform.y,
      width: layer.transform.width,
      height: layer.transform.height
    }
  };
}

export function sceneGraphToDesignDocument(scene: SceneGraph, previous?: DesignDocument): DesignDocument {
  const document = previous
    ? structuredClone(previous)
    : createEmptyDocument({
      id: scene.design_id,
      name: scene.name,
      width: scene.canvas.width,
      height: scene.canvas.height,
      now: scene.created_at
    });
  const existing = new Map(document.layers.map((layer) => [layer.id, layer]));
  document.id = scene.design_id;
  document.name = scene.name;
  document.canvas.width = scene.canvas.width;
  document.canvas.height = scene.canvas.height;
  document.updatedAt = scene.updated_at;
  document.layers = [];

  for (const layer of scene.layers) {
    const old = existing.get(layer.id);
    if (layer.type === 'background_fill') {
      const background = layer as BackgroundFillLayer;
      document.canvas.background = background.type_specific.fill_type === 'transparent'
        ? { type: 'transparent' }
        : (background.type_specific.fill_type === 'linear_gradient' || background.type_specific.fill_type === 'radial_gradient') && background.type_specific.colors.length > 1
        ? {
          type: 'gradient',
          gradient: {
            type: background.type_specific.fill_type === 'radial_gradient' ? 'radial' : 'linear',
            angle: background.type_specific.angle,
            stops: background.type_specific.colors.map((color, index, list) => ({
              color,
              offset: index / Math.max(1, list.length - 1)
            }))
          }
        }
        : { type: 'solid', color: background.type_specific.colors[0] || scene.canvas.background_color || '#ffffff' };
      continue;
    }

    const base = {
      id: layer.id,
      name: layer.name,
      x: layer.transform.x,
      y: layer.transform.y,
      width: layer.transform.width,
      height: layer.transform.height,
      rotation: layer.transform.rotation,
      opacity: layer.opacity,
      zIndex: layer.z_index,
      locked: layer.locked,
      visible: layer.visible,
      source: old?.source ?? sourceFor(layer),
      confidence: layer.source.detection_confidence,
      needsReview: Boolean(layer.source.warning_flags?.length),
      ...(old?.groupId ? { groupId: old.groupId } : {})
    };

    if (layer.type === 'text') {
      const text = layer as TextLayer;
      document.layers.push({
        ...old,
        ...base,
        type: 'text',
        text: text.type_specific.content,
        fontFamily: text.type_specific.font_family,
        lineBreaks: text.type_specific.line_breaks ?? (old?.type === 'text' ? old.lineBreaks : undefined),
        fontCandidates: text.type_specific.candidate_fonts?.map((candidate) => ({ ...candidate }))
          ?? (old?.type === 'text' ? old.fontCandidates : undefined),
        direction: text.type_specific.direction ?? (old?.type === 'text' ? old.direction : undefined),
        fontSize: Math.max(1, text.type_specific.font_size),
        fontWeight: text.type_specific.font_weight,
        fontStyle: text.type_specific.font_style || 'normal',
        lineHeight: text.type_specific.line_height || 1.2,
        letterSpacing: text.type_specific.letter_spacing || 0,
        align: text.type_specific.alignment,
        fill: text.type_specific.color,
        stroke: text.style.effects.stroke.enabled
          ? { color: text.style.effects.stroke.color, width: text.style.effects.stroke.width }
          : null,
        shadow: text.style.effects.shadow.enabled
          ? {
            color: text.style.effects.shadow.color,
            blur: text.style.effects.shadow.blur,
            offsetX: text.style.effects.shadow.offset_x,
            offsetY: text.style.effects.shadow.offset_y,
            opacity: text.style.effects.shadow.opacity
          }
          : null,
        effects: old?.type === 'text' ? old.effects : [],
        uncertain: text.type_specific.uncertain ?? (old?.type === 'text' ? old.uncertain : false),
      } as DesignLayer);
    } else if (layer.type === 'image') {
      const image = layer as ImageLayer;
      const assetId = old?.type === 'image' ? old.assetId : `asset-${layer.id}`;
      const existingMimeType = old?.type === 'image' ? document.assets[old.assetId]?.mimeType : undefined;
      const uri = image.type_specific.image_url;
      if (uri) {
        document.assets[assetId] = {
          id: assetId,
          mimeType: uri.match(/^data:(image\/[^;,]+)/)?.[1]
            ?? (typeof existingMimeType === 'string' ? existingMimeType : 'image/jpeg'),
          uri,
          name: layer.name
        };
      }
      document.layers.push({
        ...old,
        ...base,
        type: 'image',
        assetId,
        crop: old?.type === 'image' ? old.crop : null,
        maskShape: image.type_specific.mask_shape,
        objectFit: image.type_specific.object_fit ?? (old?.type === 'image' ? old.objectFit : 'cover'),
        backgroundRemoved: old?.type === 'image' ? old.backgroundRemoved : false,
        originalCropAssetId: old?.type === 'image' ? old.originalCropAssetId : null,
        effects: old?.type === 'image' ? old.effects : []
      } as DesignLayer);
    } else if (layer.type === 'shape') {
      const shape = layer as ShapeLayer;
      document.layers.push({
        ...old,
        ...base,
        type: 'shape',
        shapeType: shape.type_specific.shape_type === 'divider' ? 'line' : shape.type_specific.shape_type === 'pill' ? 'rect' : shape.type_specific.shape_type,
        fill: shape.type_specific.fill_color || null,
        gradient: shape.style.effects.gradient
          ? shape.style.effects.gradient.enabled
            ? {
              type: shape.style.effects.gradient.type,
              ...(shape.style.effects.gradient.angle !== undefined ? { angle: shape.style.effects.gradient.angle } : {}),
              stops: shape.style.effects.gradient.stops.map((stop) => ({ ...stop }))
            }
            : null
          : old?.type === 'shape' ? old.gradient : null,
        stroke: shape.style.effects.stroke.enabled
          ? shape.style.effects.stroke.color
          : null,
        strokeWidth: shape.style.effects.stroke.enabled
          ? shape.style.effects.stroke.width
          : 0,
        cornerRadius: layer.style.border_radius || 0
      } as DesignLayer);
    } else if (layer.type === 'icon' && (layer as IconLayer).type_specific.icon_name === 'qr-code') {
      const icon = layer as IconLayer;
      const uri = icon.type_specific.image_url;
      const crop = icon.type_specific.qr_fallback_crop !== undefined
        ? icon.type_specific.qr_fallback_crop
        : old?.type === 'qr' ? old.crop ?? null : null;
      const assetId = icon.type_specific.qr_generated
        ? `qr-${layer.id}`
        : old?.type === 'qr' && old.assetId ? old.assetId : `qr-${layer.id}`;
      if (uri) {
        document.assets[assetId] = {
          id: assetId,
          mimeType: uri.match(/^data:(image\/[^;,]+)/)?.[1] ?? 'image/png',
          uri,
          name: layer.name
        };
      }
      document.layers.push({
        ...old,
        ...base,
        type: 'qr',
        assetId: uri ? assetId : old?.type === 'qr' ? old.assetId : undefined,
        value: icon.type_specific.qr_value ?? icon.type_specific.svg_or_path_data ?? null,
        crop,
        generated: icon.type_specific.qr_generated ?? (old?.type === 'qr' ? old.generated : false),
        decodedOk: icon.type_specific.qr_decoded_ok ?? (old?.type === 'qr' ? old.decodedOk : Boolean(icon.type_specific.svg_or_path_data)),
        errorCorrection: old?.type === 'qr' ? old.errorCorrection : 'M'
      } as DesignLayer);
    } else {
      document.layers.push({
        ...old,
        ...base,
        type: 'shape',
        shapeType: 'rect',
        fill: '#111111',
        gradient: null,
        stroke: null,
        strokeWidth: 0,
        cornerRadius: 0
      } as DesignLayer);
    }
  }

  if (previous) {
    const existingIds = new Set(document.layers.map((layer) => layer.id));
    for (const group of previous.layers.filter((layer) => layer.type === 'group')) {
      const childIds = Array.from(new Set([
        ...group.childIds.filter((id) => existingIds.has(id)),
        ...document.layers
          .filter((layer) => layer.type !== 'group' && layer.groupId === group.id)
          .map((layer) => layer.id)
      ]));
      if (childIds.length) document.layers.push({ ...group, childIds });
    }
  }
  document.analysis.provider = scene.pipeline_meta ? 'modular' : document.analysis.provider;
  document.analysis.stages = scene.pipeline_meta?.stages.map((stage) => ({
    name: stage.name,
    status: stage.status,
    ...(stage.message ? { message: stage.message } : {})
  })) ?? document.analysis.stages;
  document.createdAt = scene.created_at;
  const validation = validateDocument(document);
  if (!validation.success) throw new Error(`Editor change produced an invalid DesignDocument: ${validation.error.message}`);
  return validation.data;
}
