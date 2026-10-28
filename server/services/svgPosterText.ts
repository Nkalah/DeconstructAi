export interface SvgPosterTextLayer {
  content: string;
  role: 'headline' | 'badge' | 'body';
  bbox: [number, number, number, number];
  font_family_hint: string;
  font_weight: string;
  font_size: number;
  letter_spacing: number;
  color: string;
  alignment: 'left' | 'center' | 'right';
  has_shadow: boolean;
  shadow_blur: number;
  overlaps_human_or_face: false;
}

interface SvgPosterShape {
  label: string;
  shape_type: 'rect' | 'ellipse';
  bbox: [number, number, number, number];
  fill_color: string;
  border_color?: string;
  border_width?: number;
  opacity?: number;
  gradient?: {
    angle: number;
    stops: { color: string; offset: number }[];
  };
}

interface SvgPosterImage {
  label: string;
  bbox: [number, number, number, number];
  mask_shape: 'rect';
  image_url: string;
  preserve_source: true;
}

interface SvgPosterVisuals {
  background: {
    fill_type: 'solid' | 'linear_gradient';
    primary_color: string;
    secondary_color?: string;
    gradient_angle?: number;
    is_uniform_or_simple: true;
  };
  shape_layers: SvgPosterShape[];
  image_layers: SvgPosterImage[];
}

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const attribute of source.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes.set(attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? '');
  }
  return attributes;
}

function numberAttribute(attributes: Map<string, string>, name: string, fallback = 0): number {
  const value = attributes.get(name);
  const parsed = value ? Number.parseFloat(value) : fallback;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedBox(x: number, y: number, width: number, height: number, canvasWidth: number, canvasHeight: number): [number, number, number, number] {
  const left = Math.max(0, Math.min(canvasWidth, x));
  const top = Math.max(0, Math.min(canvasHeight, y));
  const right = Math.max(left + 1, Math.min(canvasWidth, x + width));
  const bottom = Math.max(top + 1, Math.min(canvasHeight, y + height));
  return [
    Math.round((top / canvasHeight) * 1000),
    Math.round((left / canvasWidth) * 1000),
    Math.min(1000, Math.round((bottom / canvasHeight) * 1000)),
    Math.min(1000, Math.round((right / canvasWidth) * 1000))
  ];
}

export function parseSvgPosterText(svg: string, width: number, height: number): SvgPosterTextLayer[] {
  const textMatches = Array.from(svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi));
  return textMatches.map((match) => {
    const attributes = parseAttributes(match[1]);
    const rawX = numberAttribute(attributes, 'x');
    const rawY = numberAttribute(attributes, 'y');
    const fontSize = Math.max(1, numberAttribute(attributes, 'font-size', 32));
    const letterSpacing = numberAttribute(attributes, 'letter-spacing');
    const content = match[2]
      .replace(/<tspan\b[^>]*>/gi, '')
      .replace(/<\/tspan\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;|&#39;/g, "'")
      .trim();
    const lines = content.split(/\r?\n/).filter(Boolean);
    const measuredWidth = Math.max(...lines.map((line) =>
      line.length * fontSize * 0.72 + Math.max(0, line.length - 1) * letterSpacing
    ), fontSize * 0.5);
    const anchor = attributes.get('text-anchor')?.toLowerCase();
    const left = anchor === 'middle' ? rawX - measuredWidth / 2
      : anchor === 'end' ? rawX - measuredWidth
        : rawX;
    const top = rawY - fontSize * 0.88;
    const textHeight = Math.max(fontSize * 1.2, lines.length * fontSize * 1.2);
    const xmin = Math.round(Math.max(0, left / width) * 1000);
    const ymin = Math.round(Math.max(0, top / height) * 1000);
    const xmax = Math.min(1000, Math.round(Math.max(0, (left + measuredWidth) / width) * 1000));
    const ymax = Math.min(1000, Math.round(Math.max(0, (top + textHeight) / height) * 1000));
    const sourceFamily = attributes.get('font-family')?.split(',')[0].replace(/["']/g, '').trim();
    const role = fontSize >= 48 ? 'headline' : fontSize <= 18 ? 'badge' : 'body';
    const fill = attributes.get('fill') || '#ffffff';

    return {
      content,
      role,
      bbox: [
        ymin,
        xmin,
        Math.min(1000, Math.max(ymin + 1, ymax)),
        Math.min(1000, Math.max(xmin + 1, xmax))
      ],
      font_family_hint: sourceFamily || 'Inter',
      font_weight: attributes.get('font-weight') || 'normal',
      font_size: fontSize,
      letter_spacing: letterSpacing,
      color: fill.startsWith('#') ? fill : '#ffffff',
      alignment: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
      has_shadow: Boolean(attributes.get('filter')),
      shadow_blur: 6,
      overlaps_human_or_face: false
    };
  });
}

export function parseSvgPosterVisuals(svg: string, width: number, height: number): SvgPosterVisuals {
  const defs = svg.match(/<defs\b[^>]*>[\s\S]*?<\/defs\s*>/i)?.[0] ?? '';
  const gradientMatch = Array.from(defs.matchAll(/<linearGradient\b([^>]*)>([\s\S]*?)<\/linearGradient\s*>/gi))
    .find((match) => parseAttributes(match[1]).get('id') === 'bg');
  const gradients = new Map<string, NonNullable<SvgPosterShape['gradient']>>();
  for (const match of defs.matchAll(/<linearGradient\b([^>]*)>([\s\S]*?)<\/linearGradient\s*>/gi)) {
    const attributes = parseAttributes(match[1]);
    const stops = Array.from(match[2].matchAll(/<stop\b([^>]*)\/?\s*>/gi)).map((stop) => {
      const stopAttributes = parseAttributes(stop[1]);
      const offsetText = stopAttributes.get('offset');
      const rawOffset = numberAttribute(stopAttributes, 'offset');
      return {
        color: stopAttributes.get('stop-color') || '#0b0f19',
        offset: Math.max(0, Math.min(1, offsetText?.includes('%') ? rawOffset / 100 : rawOffset))
      };
    });
    const angle = Math.round(Math.atan2(
      numberAttribute(attributes, 'y2', 100) - numberAttribute(attributes, 'y1'),
      numberAttribute(attributes, 'x2', 100) - numberAttribute(attributes, 'x1')
    ) * 180 / Math.PI + 90);
    const id = attributes.get('id');
    if (id && stops.length) gradients.set(id, { angle, stops });
  }
  let background: SvgPosterVisuals['background'] = {
    fill_type: 'solid',
    primary_color: '#0b0f19',
    is_uniform_or_simple: true
  };
  if (gradientMatch) {
    const gradientAttributes = parseAttributes(gradientMatch[1]);
    const stops = Array.from(gradientMatch[2].matchAll(/<stop\b([^>]*)\/?\s*>/gi)).map((stop) => {
      const attributes = parseAttributes(stop[1]);
      return {
        color: attributes.get('stop-color') || '#0b0f19',
        offset: numberAttribute(attributes, 'offset')
      };
    });
    const startX = numberAttribute(gradientAttributes, 'x1');
    const startY = numberAttribute(gradientAttributes, 'y1');
    const endX = numberAttribute(gradientAttributes, 'x2', 100);
    const endY = numberAttribute(gradientAttributes, 'y2', 100);
    background = {
      fill_type: 'linear_gradient',
      primary_color: stops[0]?.color || '#0b0f19',
      secondary_color: stops[stops.length - 1]?.color || '#1e1b4b',
      gradient_angle: Math.round(Math.atan2(endY - startY, endX - startX) * 180 / Math.PI + 90),
      is_uniform_or_simple: true
    };
  }

  const shapes: SvgPosterShape[] = [];
  const body = svg.replace(/<defs\b[^>]*>[\s\S]*?<\/defs\s*>/gi, '');
  const groups = Array.from(body.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g\s*>/gi));
  const sourceGroup = groups.find((match) => /clip-path\s*=\s*["']url\(#/i.test(match[1]));
  const imageLayers: SvgPosterImage[] = [];
  if (sourceGroup) {
    const innerRect = sourceGroup[2].match(/<rect\b([^>]*)\/?\s*>/i);
    if (innerRect) {
      const attributes = parseAttributes(innerRect[1]);
      const x = numberAttribute(attributes, 'x');
      const y = numberAttribute(attributes, 'y');
      const boxWidth = numberAttribute(attributes, 'width');
      const boxHeight = numberAttribute(attributes, 'height');
      const imageSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${boxWidth} ${boxHeight}">${defs}${sourceGroup[0]}</svg>`;
      imageLayers.push({
        label: 'Product image',
        bbox: normalizedBox(x, y, boxWidth, boxHeight, width, height),
        mask_shape: 'rect',
        image_url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(imageSvg)}`,
        preserve_source: true
      });
    }
  }

  const ungroupedBody = body.replace(/<g\b[^>]*>[\s\S]*?<\/g\s*>/gi, '');
  for (const match of ungroupedBody.matchAll(/<(rect|circle)\b([^>]*)\/?\s*>/gi)) {
    const tag = match[1].toLowerCase();
    const attributes = parseAttributes(match[2]);
    const fill = attributes.get('fill') || 'transparent';
    const stroke = attributes.get('stroke');
    const opacity = numberAttribute(attributes, 'opacity', 1) * numberAttribute(attributes, 'fill-opacity', 1);
    let x: number;
    let y: number;
    let boxWidth: number;
    let boxHeight: number;
    let shapeType: SvgPosterShape['shape_type'];
    if (tag === 'rect') {
      x = numberAttribute(attributes, 'x');
      y = numberAttribute(attributes, 'y');
      boxWidth = numberAttribute(attributes, 'width');
      boxHeight = numberAttribute(attributes, 'height');
      shapeType = 'rect';
      if (x === 0 && y === 0 && boxWidth >= width && boxHeight >= height) continue;
    } else {
      const cx = numberAttribute(attributes, 'cx');
      const cy = numberAttribute(attributes, 'cy');
      const radius = numberAttribute(attributes, 'r');
      x = cx - radius;
      y = cy - radius;
      boxWidth = radius * 2;
      boxHeight = radius * 2;
      shapeType = 'ellipse';
    }
    if (!boxWidth || !boxHeight || (!stroke && fill === 'transparent')) continue;
    const isBadge = Boolean(attributes.get('rx')) && boxWidth < width * 0.5;
    const isCard = shapeType === 'rect' && boxWidth > width * 0.6 && boxHeight > height * 0.08;
    const gradientId = fill.match(/^url\(#([^)]+)\)$/)?.[1];
    shapes.push({
      label: isCard ? 'Details card' : isBadge ? 'Badge' : shapeType === 'ellipse' ? 'Decorative circle' : 'Decorative shape',
      shape_type: shapeType,
      bbox: normalizedBox(x, y, boxWidth, boxHeight, width, height),
      fill_color: fill.startsWith('url(#') ? '#6366f1' : fill,
      ...(gradientId && gradients.has(gradientId) ? { gradient: gradients.get(gradientId) } : {}),
      ...(stroke ? { border_color: stroke, border_width: numberAttribute(attributes, 'stroke-width', 1) } : {}),
      opacity
    });
  }

  return { background, shape_layers: shapes, image_layers: imageLayers };
}
