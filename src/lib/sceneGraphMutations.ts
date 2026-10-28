import { SceneGraph, Layer, TextLayer, ImageLayer, ShapeLayer, BackgroundFillLayer, MutationOperation, WarningFlag } from '../types/sceneGraph';

export interface MutationResult {
  scene: SceneGraph;
  affectedLayerIds: string[];
  warningsAdded: { layerId: string; flag: WarningFlag; reason: string }[];
  summary: string;
}

export function applyMutation(scene: SceneGraph, op: MutationOperation): MutationResult {
  // Deep clone scene graph
  const nextScene: SceneGraph = JSON.parse(JSON.stringify(scene));
  nextScene.updated_at = new Date().toISOString();
  
  const affectedLayerIds: string[] = [];
  const warningsAdded: { layerId: string; flag: WarningFlag; reason: string }[] = [];
  let summary = '';

  switch (op.type) {
    case 'update_text': {
      const layer = nextScene.layers.find(l => l.id === op.layer_id);
      if (layer && layer.type === 'text') {
        const textLayer = layer as TextLayer;
        const oldContent = textLayer.type_specific.content;
        textLayer.type_specific.content = typeof op.params.content === 'string' ? op.params.content : oldContent;
        if (typeof op.params.content === 'string' && op.params.content !== oldContent) {
          let offset = 0;
          textLayer.type_specific.line_breaks = op.params.content.split('\n').slice(0, -1).map((line) => {
            offset += line.length + 1;
            return offset;
          });
          textLayer.type_specific.uncertain = op.params.uncertain ?? false;
        }
        if (op.params.uncertain !== undefined) textLayer.type_specific.uncertain = Boolean(op.params.uncertain);
        if (op.params.font_family) {
          textLayer.type_specific.font_family = op.params.font_family;
          textLayer.type_specific.font_family_confidence = op.params.font_family_confidence ?? 1;
          layer.source.warning_flags = layer.source.warning_flags?.filter((flag) => flag !== 'approximate_font');
        } else if (op.params.font_family_confidence !== undefined) {
          textLayer.type_specific.font_family_confidence = Number(op.params.font_family_confidence);
        }
        if (op.params.font_size !== undefined) textLayer.type_specific.font_size = Math.max(1, Number(op.params.font_size));
        if (op.params.font_weight !== undefined) textLayer.type_specific.font_weight = op.params.font_weight;
        if (op.params.font_style) textLayer.type_specific.font_style = op.params.font_style;
        if (op.params.color) textLayer.type_specific.color = op.params.color;
        if (op.params.alignment) textLayer.type_specific.alignment = op.params.alignment;
        if (op.params.letter_spacing !== undefined) textLayer.type_specific.letter_spacing = op.params.letter_spacing;
        if (op.params.line_height !== undefined) textLayer.type_specific.line_height = op.params.line_height;
        if (op.params.direction) textLayer.type_specific.direction = op.params.direction;

        affectedLayerIds.push(layer.id);
        summary = `Changed text on "${layer.name}"`;
      }
      break;
    }

    case 'replace_image': {
      const layer = nextScene.layers.find(l => l.id === op.layer_id);
      if (layer && layer.type === 'image') {
        const imgLayer = layer as ImageLayer;
        imgLayer.type_specific.image_url = op.params.image_url;
        if (op.params.mask_shape) imgLayer.type_specific.mask_shape = op.params.mask_shape;
        affectedLayerIds.push(layer.id);
        summary = `Replaced image on layer "${layer.name}"`;
      }
      break;
    }

    case 'update_qr': {
      const layer = nextScene.layers.find((item) => item.id === op.layer_id);
      if (layer?.type === 'icon' && layer.type_specific.icon_name === 'qr-code') {
        const value = typeof op.params.value === 'string' ? op.params.value.trim() : '';
        const imageUrl = typeof op.params.image_url === 'string' ? op.params.image_url : '';
        if (!value || !imageUrl) break;
        layer.type_specific.qr_value = value;
        layer.type_specific.svg_or_path_data = value;
        layer.type_specific.image_url = imageUrl;
        layer.type_specific.qr_decoded_ok = true;
        layer.type_specific.qr_fallback_crop = null;
        layer.type_specific.qr_generated = true;
        layer.type_specific.fill_color = '#111111';
        layer.source.warning_flags = layer.source.warning_flags?.filter((flag) => flag !== 'qr_decode_unreliable');
        affectedLayerIds.push(layer.id);
        summary = `Updated destination for "${layer.name}"`;
      }
      break;
    }

    case 'set_color': {
      const layer = nextScene.layers.find(l => l.id === op.layer_id);
      if (layer) {
        if (layer.type === 'text') {
          (layer as TextLayer).type_specific.color = op.params.color;
        } else if (layer.type === 'shape') {
          const shape = layer as ShapeLayer;
          shape.type_specific.fill_color = op.params.color;
          if (shape.style.effects.gradient) shape.style.effects.gradient.enabled = false;
        } else if (layer.type === 'background_fill') {
          const bg = layer as BackgroundFillLayer;
          bg.type_specific.colors = [op.params.color];
          bg.type_specific.fill_type = 'solid';
        }
        affectedLayerIds.push(layer.id);
        summary = `Changed color for "${layer.name}" to ${op.params.color}`;
      }
      break;
    }

    case 'set_effect': {
      const layer = nextScene.layers.find(l => l.id === op.layer_id);
      if (layer) {
        if (!layer.style.effects) {
          layer.style.effects = {
            shadow: { enabled: false, offset_x: 0, offset_y: 4, blur: 8, color: '#000000', opacity: 0.35 },
            stroke: { enabled: false, width: 2, color: '#000000' }
          };
        }
        if (op.params.shadow !== undefined) {
          layer.style.effects.shadow = { ...layer.style.effects.shadow, ...op.params.shadow };
        }
        if (op.params.stroke !== undefined) {
          layer.style.effects.stroke = { ...layer.style.effects.stroke, ...op.params.stroke };
        }
        if (op.params.opacity !== undefined) {
          layer.opacity = Math.max(0, Math.min(1, Number(op.params.opacity)));
        }
        affectedLayerIds.push(layer.id);
        summary = `Updated effects on "${layer.name}"`;
      }
      break;
    }

    case 'delete_layer': {
      const targetIndex = nextScene.layers.findIndex(l => l.id === op.layer_id);
      if (targetIndex !== -1) {
        const deleted = nextScene.layers.splice(targetIndex, 1)[0];
        affectedLayerIds.push(deleted.id);
        summary = `Deleted layer "${deleted.name}" (underneath background preserved)`;
      }
      break;
    }

    case 'add_layer': {
      const newLayer: Layer = op.params.layer;
      if (newLayer) {
        const maxZ = nextScene.layers.reduce((max, l) => Math.max(max, l.z_index), 0);
        newLayer.z_index = maxZ + 1;
        newLayer.source = {
          detection_confidence: 1.0,
          extraction_method: 'user_added',
          warning_flags: []
        };
        nextScene.layers.push(newLayer);
        affectedLayerIds.push(newLayer.id);
        summary = `Added new layer "${newLayer.name}"`;
      }
      break;
    }

    case 'reorder_layer': {
      const layer = nextScene.layers.find((item) => item.id === op.layer_id);
      if (layer && layer.type !== 'background_fill' && typeof op.params.new_z_index === 'number') {
        const oldZ = layer.z_index;
        const reorderable = nextScene.layers
          .filter((item) => item.type !== 'background_fill' && item.id !== layer.id)
          .sort((left, right) => left.z_index - right.z_index);
        const beforeIndex = typeof op.params.before_layer_id === 'string'
          ? reorderable.findIndex((item) => item.id === op.params.before_layer_id)
          : -1;
        const afterIndex = typeof op.params.after_layer_id === 'string'
          ? reorderable.findIndex((item) => item.id === op.params.after_layer_id)
          : -1;
        const requestedPosition = Math.max(1, Math.min(
          reorderable.length + 1,
          Math.round(op.params.new_z_index),
        ));
        const insertionIndex = beforeIndex !== -1
          ? beforeIndex
          : afterIndex !== -1
            ? afterIndex + 1
            : requestedPosition - 1;
        reorderable.splice(insertionIndex, 0, layer);
        reorderable.forEach((item, index) => { item.z_index = index + 1; });
        for (const background of nextScene.layers.filter((item) => item.type === 'background_fill')) {
          background.z_index = 0;
        }
        affectedLayerIds.push(layer.id);
        summary = `Reordered "${layer.name}" from depth ${oldZ} to ${layer.z_index}`;
      }
      break;
    }

    case 'rename_layer': {
      const layer = nextScene.layers.find((item) => item.id === op.layer_id);
      const name = typeof op.params.name === 'string' ? op.params.name.trim() : '';
      if (layer && name) {
        const oldName = layer.name;
        layer.name = name;
        affectedLayerIds.push(layer.id);
        summary = `Renamed "${oldName}" to "${name}"`;
      }
      break;
    }

    case 'update_transform': {
      const layer = nextScene.layers.find(l => l.id === op.layer_id);
      if (layer && op.params.transform) {
        layer.transform = {
          ...layer.transform,
          ...op.params.transform
        };
        affectedLayerIds.push(layer.id);
        summary = `Adjusted transform for "${layer.name}"`;
      }
      break;
    }

    case 'toggle_visibility': {
      const layer = nextScene.layers.find(l => l.id === op.layer_id);
      if (layer) {
        layer.visible = op.params.visible ?? !layer.visible;
        affectedLayerIds.push(layer.id);
        summary = `${layer.visible ? 'Showed' : 'Hidden'} layer "${layer.name}"`;
      }
      break;
    }

    case 'toggle_lock': {
      const layer = nextScene.layers.find(l => l.id === op.layer_id);
      if (layer) {
        layer.locked = op.params.locked ?? !layer.locked;
        affectedLayerIds.push(layer.id);
        summary = `${layer.locked ? 'Locked' : 'Unlocked'} layer "${layer.name}"`;
      }
      break;
    }

    case 'resize_canvas': {
      const oldW = nextScene.canvas.width;
      const oldH = nextScene.canvas.height;
      const newW = op.params.width || oldW;
      const newH = op.params.height || oldH;
      const scaleX = newW / oldW;
      const scaleY = newH / oldH;
      const uniformScale = Math.min(scaleX, scaleY);

      nextScene.canvas.width = newW;
      nextScene.canvas.height = newH;
      nextScene.canvas.aspect_ratio_name = op.params.preset_name || `${newW}x${newH}`;

      // Center offset to maintain focal balance
      const offsetX = (newW - oldW * uniformScale) / 2;
      const offsetY = (newH - oldH * uniformScale) / 2;

      for (const layer of nextScene.layers) {
        if (layer.type === 'background_fill') {
          layer.transform.x = 0;
          layer.transform.y = 0;
          layer.transform.width = newW;
          layer.transform.height = newH;
          continue;
        }

        const prevX = layer.transform.x;
        const prevY = layer.transform.y;
        const prevW = layer.transform.width;
        const prevH = layer.transform.height;

        layer.transform.x = Math.round(prevX * uniformScale + offsetX);
        layer.transform.y = Math.round(prevY * uniformScale + offsetY);
        layer.transform.width = Math.round(prevW * uniformScale);
        layer.transform.height = Math.round(prevH * uniformScale);

        if (layer.type === 'text') {
          const t = layer as TextLayer;
          t.type_specific.font_size = Math.round(t.type_specific.font_size * uniformScale);
        }

        // Section 5 Requirement 3: Check for boundary clipping or overlap
        const isClipped = 
          layer.transform.x < 0 || 
          layer.transform.y < 0 || 
          layer.transform.x + layer.transform.width > newW || 
          layer.transform.y + layer.transform.height > newH;

        if (isClipped) {
          if (!layer.source.warning_flags) layer.source.warning_flags = [];
          if (!layer.source.warning_flags.includes('clipped_on_resize')) {
            layer.source.warning_flags.push('clipped_on_resize');
          }
          warningsAdded.push({
            layerId: layer.id,
            flag: 'clipped_on_resize',
            reason: `Layer "${layer.name}" extends beyond the new canvas bounds. Manual review recommended.`
          });
        }
        affectedLayerIds.push(layer.id);
      }
      summary = `Resized canvas to ${newW}x${newH} (${op.params.preset_name || 'custom'}). Auto-reflowed ${nextScene.layers.length} layers.`;
      break;
    }

    case 'batch_mutation': {
      if (Array.isArray(op.params.mutations)) {
        let currentScene = nextScene;
        for (const subOp of op.params.mutations) {
          const res = applyMutation(currentScene, subOp);
          currentScene = res.scene;
          affectedLayerIds.push(...res.affectedLayerIds);
          warningsAdded.push(...res.warningsAdded);
        }
        return {
          scene: currentScene,
          affectedLayerIds: Array.from(new Set(affectedLayerIds)),
          warningsAdded,
          summary: op.description || `Applied batch of ${op.params.mutations.length} mutations.`
        };
      }
      break;
    }
  }

  return {
    scene: nextScene,
    affectedLayerIds,
    warningsAdded,
    summary
  };
}
