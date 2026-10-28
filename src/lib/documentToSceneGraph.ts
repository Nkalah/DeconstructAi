import type { DesignDocument, DesignLayer } from '../core/schema/designDocument';
import type {
  BackgroundFillLayer,
  Layer,
  SceneGraph,
  WarningFlag
} from '../types/sceneGraph';

function commonLayer(layer: DesignLayer) {
  return {
    id: layer.id,
    name: layer.name,
    z_index: layer.zIndex,
    transform: {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      rotation: layer.rotation
    },
    opacity: layer.opacity,
    visible: layer.visible,
    locked: layer.locked,
    source: {
      detection_confidence: layer.confidence ?? 0,
      extraction_method: layer.source.origin === 'ocr'
        ? 'ocr' as const
        : layer.source.origin === 'fallback'
          ? 'raster' as const
          : layer.type === 'image' ? 'segmentation' as const : 'user_added' as const,
      warning_flags: [
        ...(layer.needsReview ? ['ambiguous_z_order' as WarningFlag] : []),
        ...(layer.source.warning_flags?.filter((flag) =>
          flag === 'font_detection_failed' || flag === 'foreground_not_isolated'
        ) ?? [])
      ]
    },
    style: {
      effects: {
        shadow: { enabled: false, offset_x: 0, offset_y: 0, blur: 0, color: '#000000', opacity: 0 },
        stroke: { enabled: false, width: 0, color: '#000000' }
      }
    }
  };
}

export function documentToSceneGraph(document: DesignDocument): SceneGraph {
  const layers: Layer[] = [];
  let backgroundColor: string | null = '#ffffff';
  if (document.canvas.background.type === 'solid') {
    backgroundColor = document.canvas.background.color;
  } else if (document.canvas.background.type === 'gradient') {
    backgroundColor = document.canvas.background.gradient.stops[0]?.color || backgroundColor;
  } else if (document.canvas.background.type === 'transparent') {
    backgroundColor = null;
  }

  const previewUri = Object.values(document.assets).find((asset) => asset.name === 'Analysis preview')?.uri;
  const originalUri = document.originalAsset
    ? document.assets[document.originalAsset.assetId]?.uri
    : Object.values(document.assets).find((asset) => asset.name?.includes('raster fallback'))?.uri;

  for (const layer of document.layers) {
    if (layer.type === 'group') continue;
    if (layer.type === 'shape' && layer.name === 'Background') continue;
    const base = commonLayer(layer);
    if (layer.type === 'text') {
      layers.push({
        ...base,
        type: 'text',
        type_specific: {
          content: layer.text,
          line_breaks: layer.lineBreaks,
          uncertain: layer.uncertain,
          direction: layer.direction ?? 'auto',
          font_family: layer.fontFamily,
          font_family_confidence: layer.confidence ?? 0,
          candidate_fonts: layer.fontCandidates,
          font_size: layer.fontSize,
          font_weight: layer.fontWeight,
          font_style: layer.fontStyle,
          color: layer.fill,
          alignment: layer.align,
          letter_spacing: layer.letterSpacing,
          line_height: layer.lineHeight
        },
        style: {
          ...base.style,
          effects: {
            ...base.style.effects,
            stroke: layer.stroke
              ? { enabled: true, width: layer.stroke.width, color: layer.stroke.color }
              : base.style.effects.stroke,
            shadow: layer.shadow
              ? {
                enabled: true,
                offset_x: layer.shadow.offsetX,
                offset_y: layer.shadow.offsetY,
                blur: layer.shadow.blur,
                color: layer.shadow.color,
                opacity: layer.shadow.opacity
              }
              : base.style.effects.shadow
          }
        }
      });
    } else if (layer.type === 'image') {
      const imageUri = document.assets[layer.assetId]?.uri || previewUri || '';
      layers.push({
        ...base,
        type: 'image',
        type_specific: {
          image_url: imageUri,
          mask_shape: layer.maskShape ?? 'rect',
          object_fit: layer.objectFit,
          replaceable: false,
          object_label: layer.name
        },
        style: base.style
      });
    } else if (layer.type === 'shape') {
      layers.push({
        ...base,
        type: 'shape',
        type_specific: {
          shape_type: layer.shapeType === 'line' ? 'divider' : layer.shapeType,
          fill_color: layer.fill || 'transparent'
        },
        style: {
          ...base.style,
          border_radius: layer.cornerRadius,
          effects: {
            ...base.style.effects,
            stroke: {
              enabled: Boolean(layer.stroke),
              width: layer.strokeWidth,
              color: layer.stroke || '#000000'
            },
            ...(layer.gradient ? {
              gradient: {
                enabled: true,
                type: layer.gradient.type,
                angle: layer.gradient.angle,
                stops: layer.gradient.stops
              }
            } : {})
          }
        }
      });
    } else if (layer.type === 'qr') {
      const source = {
        ...base.source,
        warning_flags: [
          ...(base.source.warning_flags ?? []),
          ...(layer.source.origin === 'detector' && !layer.decodedOk ? ['qr_decode_unreliable' as const] : [])
        ]
      };
      layers.push({
        ...base,
        source,
        type: 'icon',
        type_specific: {
          icon_name: 'qr-code',
          svg_or_path_data: layer.value || undefined,
          fill_color: '#111111',
          image_url: (layer.assetId ? document.assets[layer.assetId]?.uri : undefined) || undefined,
          qr_value: layer.value,
          qr_decoded_ok: layer.decodedOk,
          qr_fallback_crop: layer.crop ?? null,
          qr_generated: layer.generated ?? false
        }
      });
    }
  }

  const background: BackgroundFillLayer = {
    id: `background-${document.id}`,
    name: 'Background',
    type: 'background_fill',
    z_index: -1,
    transform: { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height, rotation: 0 },
    opacity: 1,
    visible: true,
    locked: true,
    source: { detection_confidence: 1, extraction_method: 'user_added' },
    style: {
      effects: {
        shadow: { enabled: false, offset_x: 0, offset_y: 0, blur: 0, color: '#000000', opacity: 0 },
        stroke: { enabled: false, width: 0, color: '#000000' }
      }
    },
    type_specific: document.canvas.background.type === 'gradient'
      ? {
        fill_type: document.canvas.background.gradient.type === 'radial' ? 'radial_gradient' : 'linear_gradient',
        colors: document.canvas.background.gradient.stops.map((stop) => stop.color),
        angle: document.canvas.background.gradient.angle ?? 0
      }
      : document.canvas.background.type === 'transparent'
        ? { fill_type: 'transparent', colors: [], angle: 0 }
        : { fill_type: 'solid', colors: [backgroundColor ?? '#ffffff'], angle: 0 }
  };

  const warnings: WarningFlag[] = document.analysis.warnings.length ? ['ambiguous_z_order'] : [];
  return {
    design_id: document.id,
    name: document.name,
    created_at: document.createdAt,
    updated_at: document.updatedAt,
    canvas: {
      width: document.canvas.width,
      height: document.canvas.height,
      background_color: backgroundColor,
      aspect_ratio_name: `${document.canvas.width}x${document.canvas.height}`
    },
    layers: [background, ...layers],
    original_image_url: originalUri || previewUri,
    original_asset_id: document.originalAsset?.assetId,
    pipeline_meta: {
      total_duration_ms: 0,
      stages: document.analysis.stages.map((stage, index) => ({
        stage: index,
        name: stage.name,
        duration_ms: 0,
        status: stage.status,
        message: stage.message
      })),
      overall_confidence: layers.length
        ? layers.reduce((sum, layer) => sum + layer.source.detection_confidence, 0) / layers.length
        : 0,
      warning_count: warnings.length,
      deterministic_background_used: false
    }
  };
}
