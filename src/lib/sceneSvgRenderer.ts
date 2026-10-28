import { SceneGraph, Layer, TextLayer, ImageLayer, ShapeLayer, BackgroundFillLayer } from '../types/sceneGraph';

export function renderSceneToSvgString(scene: SceneGraph, multiplier = 1): string {
  const w = Math.round(scene.canvas.width * multiplier);
  const h = Math.round(scene.canvas.height * multiplier);

  // Sort layers by z_index
  const sortedLayers = [...scene.layers]
    .filter(l => l.visible !== false)
    .sort((a, b) => a.z_index - b.z_index);

  let defs = '';
  let layerSvgs = '';

  for (let i = 0; i < sortedLayers.length; i++) {
    const layer = sortedLayers[i];
    const lid = `layer-${layer.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-${i}`;
    const x = Math.round(layer.transform.x * multiplier);
    const y = Math.round(layer.transform.y * multiplier);
    const lw = Math.round(layer.transform.width * multiplier);
    const lh = Math.round(layer.transform.height * multiplier);
    const rot = layer.transform.rotation || 0;
    const opacity = layer.opacity !== undefined ? layer.opacity : 1;

    // Filter effects (Drop shadow)
    let filterAttr = '';
    const shadow = layer.style?.effects?.shadow;
    if (shadow && shadow.enabled) {
      const filterId = `shadow-${lid}`;
      const dx = Math.round(shadow.offset_x * multiplier);
      const dy = Math.round(shadow.offset_y * multiplier);
      const blur = Math.round((shadow.blur || 4) * multiplier);
      defs += `
        <filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${blur / 2}" flood-color="${escapeXml(shadow.color || '#000000')}" flood-opacity="${shadow.opacity || 0.4}" />
        </filter>
      `;
      filterAttr = `filter="url(#${filterId})"`;
    }

    const transformAttr = rot !== 0 ? `transform="rotate(${rot} ${x + lw / 2} ${y + lh / 2})"` : '';

    if (layer.type === 'background_fill') {
      const bg = layer as BackgroundFillLayer;
      if (bg.type_specific.fill_type === 'linear_gradient' && bg.type_specific.colors.length > 1) {
        const gradId = `bg-grad-${lid}`;
        defs += `
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${bg.type_specific.angle} .5 .5)">
            <stop offset="0%" stop-color="${escapeXml(bg.type_specific.colors[0])}" />
            <stop offset="100%" stop-color="${escapeXml(bg.type_specific.colors[1])}" />
          </linearGradient>
        `;
        layerSvgs += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#${gradId})" />\n`;
      } else if (bg.type_specific.fill_type === 'radial_gradient' && bg.type_specific.colors.length > 1) {
        const gradId = `bg-grad-${lid}`;
        defs += `
          <radialGradient id="${gradId}">
            <stop offset="0%" stop-color="${escapeXml(bg.type_specific.colors[0])}" />
            <stop offset="100%" stop-color="${escapeXml(bg.type_specific.colors[1])}" />
          </radialGradient>
        `;
        layerSvgs += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#${gradId})" />\n`;
      } else if (bg.type_specific.fill_type === 'reconstructed_texture' && bg.type_specific.reconstructed_image_url) {
        layerSvgs += `<image href="${escapeXml(bg.type_specific.reconstructed_image_url)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" />\n`;
      } else {
        const color = bg.type_specific.colors[0] || scene.canvas.background_color || '#0f172a';
        layerSvgs += `<rect x="0" y="0" width="${w}" height="${h}" fill="${escapeXml(color)}" />\n`;
      }
    } else if (layer.type === 'shape') {
      const shape = layer as ShapeLayer;
      let fill = shape.type_specific.fill_color || '#334155';
      let gradientFill: string | null = null;
      const gradient = layer.style?.effects?.gradient;
      if (gradient?.enabled && gradient.stops.length > 0) {
        const gradientId = `shape-grad-${lid}`;
        const stops = gradient.stops
          .map((stop) => `<stop offset="${Math.max(0, Math.min(1, stop.offset)) * 100}%" stop-color="${escapeXml(stop.color)}" />`)
          .join('');
        defs += gradient.type === 'radial'
          ? `<radialGradient id="${gradientId}">${stops}</radialGradient>`
          : `<linearGradient id="${gradientId}" gradientTransform="rotate(${gradient.angle ?? 0} .5 .5)">${stops}</linearGradient>`;
        fill = `url(#${gradientId})`;
        gradientFill = fill;
      }
      const stroke = layer.style?.effects?.stroke;
      const fillAttr = gradientFill ?? escapeXml(fill);
      const strokeAttr = stroke && stroke.enabled ? `stroke="${escapeXml(stroke.color)}" stroke-width="${Math.round(stroke.width * multiplier)}"` : '';

      if (shape.type_specific.shape_type === 'ellipse') {
        const rx = lw / 2;
        const ry = lh / 2;
        layerSvgs += `<ellipse cx="${x + rx}" cy="${y + ry}" rx="${rx}" ry="${ry}" fill="${fillAttr}" opacity="${opacity}" ${strokeAttr} ${filterAttr} ${transformAttr} />\n`;
      } else if (shape.type_specific.shape_type === 'pill') {
        const r = Math.round(lh / 2);
        layerSvgs += `<rect x="${x}" y="${y}" width="${lw}" height="${lh}" rx="${r}" fill="${fillAttr}" opacity="${opacity}" ${strokeAttr} ${filterAttr} ${transformAttr} />\n`;
      } else {
        const r = Math.round((layer.style?.border_radius || 0) * multiplier);
        layerSvgs += `<rect x="${x}" y="${y}" width="${lw}" height="${lh}" rx="${r}" fill="${fillAttr}" opacity="${opacity}" ${strokeAttr} ${filterAttr} ${transformAttr} />\n`;
      }
    } else if (layer.type === 'image') {
      const img = layer as ImageLayer;
      const clipId = `clip-${lid}`;
      const isCircle = img.type_specific.mask_shape === 'circle' || img.type_specific.mask_shape === 'ellipse';
      const rx = Math.round((layer.style?.border_radius || 12) * multiplier);

      if (isCircle) {
        defs += `
          <clipPath id="${clipId}">
            <ellipse cx="${x + lw / 2}" cy="${y + lh / 2}" rx="${lw / 2}" ry="${lh / 2}" />
          </clipPath>
        `;
      } else {
        defs += `
          <clipPath id="${clipId}">
            <rect x="${x}" y="${y}" width="${lw}" height="${lh}" rx="${rx}" />
          </clipPath>
        `;
      }

      const stroke = layer.style?.effects?.stroke;
      const strokeElement = stroke && stroke.enabled
        ? (isCircle 
            ? `<ellipse cx="${x + lw / 2}" cy="${y + lh / 2}" rx="${lw / 2}" ry="${lh / 2}" fill="none" stroke="${escapeXml(stroke.color)}" stroke-width="${Math.round(stroke.width * multiplier)}" />`
            : `<rect x="${x}" y="${y}" width="${lw}" height="${lh}" rx="${rx}" fill="none" stroke="${escapeXml(stroke.color)}" stroke-width="${Math.round(stroke.width * multiplier)}" />`)
        : '';

      const preserveAspectRatio = img.type_specific.object_fit === 'contain' || img.type_specific.object_fit === 'scale-down'
        ? 'xMidYMid meet'
        : img.type_specific.object_fit === 'fill'
          ? 'none'
          : 'xMidYMid slice';
      layerSvgs += `
        <g ${filterAttr} ${transformAttr} opacity="${opacity}">
          <image href="${escapeXml(img.type_specific.image_url)}" x="${x}" y="${y}" width="${lw}" height="${lh}" preserveAspectRatio="${preserveAspectRatio}" clip-path="url(#${clipId})" />
          ${strokeElement}
        </g>\n`;
    } else if (layer.type === 'icon') {
      const icon = layer.type_specific;
      if (icon.image_url) {
        layerSvgs += `<image href="${escapeXml(icon.image_url)}" x="${x}" y="${y}" width="${lw}" height="${lh}" preserveAspectRatio="none" opacity="${opacity}" ${filterAttr} ${transformAttr} />\n`;
      } else {
        const paths: Record<string, string> = {
          'qr-code': '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 14h2M19 18v3M14 20h3" />',
          'map-pin': '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />',
          calendar: '<rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" />',
          heart: '<path d="M20.8 8.8c0 5.5-8.8 11-8.8 11s-8.8-5.5-8.8-11a4.8 4.8 0 0 1 8.8-2.7 4.8 4.8 0 0 1 8.8 2.7Z" />',
          star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />'
        };
        const path = paths[icon.icon_name] ?? paths.star;
        layerSvgs += `<svg x="${x}" y="${y}" width="${lw}" height="${lh}" viewBox="0 0 24 24" fill="none" stroke="${escapeXml(icon.fill_color || '#111111')}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" ${filterAttr} ${transformAttr}>${path}</svg>\n`;
      }
    } else if (layer.type === 'text') {
      const text = layer as TextLayer;
      const fontSize = Math.round(text.type_specific.font_size * multiplier);
      const fontFamily = text.type_specific.font_family || 'sans-serif';
      const fontWeight = text.type_specific.font_weight || 'normal';
      const color = text.type_specific.color || '#ffffff';
      const align = text.type_specific.alignment || 'left';
      const letterSpacing = text.type_specific.letter_spacing || 0;

      let textAnchor = 'start';
      let textX = x;
      if (align === 'center') {
        textAnchor = 'middle';
        textX = x + lw / 2;
      } else if (align === 'right') {
        textAnchor = 'end';
        textX = x + lw;
      }

      const lines = (text.type_specific.content || '').split('\n');
      const lineHeightPx = fontSize * (text.type_specific.line_height || 1.15);

      const stroke = layer.style?.effects?.stroke;
      const strokeAttr = stroke && stroke.enabled ? `stroke="${escapeXml(stroke.color)}" stroke-width="${Math.round(stroke.width * multiplier)}" paint-order="stroke fill"` : '';

      let tspans = '';
      lines.forEach((line, idx) => {
        const dy = idx === 0 ? fontSize : lineHeightPx;
        tspans += `<tspan x="${textX}" dy="${dy}">${escapeXml(line)}</tspan>`;
      });

      layerSvgs += `
        <text 
          x="${textX}" 
          y="${y}" 
          font-family="${escapeXml(fontFamily)}, sans-serif" 
          font-size="${fontSize}px" 
          font-weight="${escapeXml(String(fontWeight))}" 
          font-style="${escapeXml(text.type_specific.font_style || 'normal')}" 
          fill="${escapeXml(color)}" 
          text-anchor="${textAnchor}" 
          letter-spacing="${letterSpacing}px" 
          opacity="${opacity}" 
          ${strokeAttr}
          ${filterAttr} 
          ${transformAttr}
        >
          ${tspans}
        </text>\n`;
    }
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    ${defs}
  </defs>
  ${layerSvgs}
</svg>
  `.trim();
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
