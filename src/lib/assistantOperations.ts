import { z } from 'zod';
import {
  DesignDocumentSchema,
  DesignLayerSchema,
  type DesignDocument,
  type DesignLayer
} from '../core/schema/designDocument';

const updateFieldsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  rotation: z.number().finite().optional(),
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean().optional(),
  fontFamily: z.string().min(1).optional(),
  fontSize: z.number().positive().optional(),
  fontWeight: z.union([z.string(), z.number()]).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.number().finite().optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  fill: z.string().optional(),
  stroke: z.object({ color: z.string(), width: z.number().nonnegative() }).nullable().optional(),
  shadow: z.object({
    color: z.string(),
    blur: z.number().nonnegative(),
    offsetX: z.number(),
    offsetY: z.number(),
    opacity: z.number().min(0).max(1)
  }).nullable().optional(),
  strokeWidth: z.number().nonnegative().optional(),
  cornerRadius: z.number().nonnegative().optional()
}).strict().refine((fields) => Object.keys(fields).length > 0, 'At least one layer field must be updated.');

export const AssistantOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('updateLayer'), layerId: z.string().min(1), updates: updateFieldsSchema }).strict(),
  z.object({ op: z.literal('createLayer'), layer: DesignLayerSchema }).strict(),
  z.object({ op: z.literal('deleteLayer'), layerId: z.string().min(1) }).strict(),
  z.object({ op: z.literal('moveLayer'), layerId: z.string().min(1), x: z.number().finite(), y: z.number().finite() }).strict(),
  z.object({ op: z.literal('replaceText'), layerId: z.string().min(1), text: z.string().max(10000) }).strict(),
  z.object({
    op: z.literal('reorder'),
    layerId: z.string().min(1),
    position: z.number().int().nonnegative()
  }).strict(),
  z.object({
    op: z.literal('groupLayers'),
    layerIds: z.array(z.string().min(1)).min(2).max(100),
    name: z.string().min(1).max(200).optional()
  }).strict(),
  z.object({
    op: z.literal('resizeCanvas'),
    width: z.number().positive().max(20000),
    height: z.number().positive().max(20000),
    unit: z.enum(['px', 'pt', 'mm', 'in']).optional()
  }).strict(),
  z.object({ op: z.literal('translateText'), layerId: z.string().min(1), translatedText: z.string().max(10000) }).strict()
]);

export type AssistantOperation = z.infer<typeof AssistantOperationSchema>;

export const AssistantLayerSummarySchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string(),
  text: z.string().optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  zIndex: z.number().int(),
  fontSize: z.number().positive().optional(),
  fontFamily: z.string().optional(),
  fill: z.string().optional(),
  locked: z.boolean()
}).strict();

export const AssistantDocumentSummarySchema = z.object({
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    unit: z.enum(['px', 'pt', 'mm', 'in'])
  }).strict(),
  layers: z.array(AssistantLayerSummarySchema).max(500)
}).strict();

export type AssistantDocumentSummary = z.infer<typeof AssistantDocumentSummarySchema>;

export function summarizeDocumentForAssistant(document: DesignDocument): AssistantDocumentSummary {
  return {
    canvas: {
      width: document.canvas.width,
      height: document.canvas.height,
      unit: document.canvas.unit
    },
    layers: document.layers.map((layer) => ({
      id: layer.id,
      type: layer.type,
      name: layer.name,
      ...(layer.type === 'text' ? { text: layer.text.slice(0, 1000) } : {}),
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      zIndex: layer.zIndex,
      ...(layer.type === 'text' ? {
        fontSize: layer.fontSize,
        fontFamily: layer.fontFamily,
        fill: layer.fill
      } : {}),
      locked: layer.locked
    }))
  };
}

export function validateAssistantOperations(
  input: unknown,
  summary: AssistantDocumentSummary
): AssistantOperation[] {
  const parsed = z.array(AssistantOperationSchema).min(1).max(50).parse(input);
  const layers = new Map(summary.layers.map((layer) => [layer.id, layer]));
  const assertLayer = (id: string, expectedType?: string) => {
    const layer = layers.get(id);
    if (!layer) throw new Error(`Assistant operation references unknown layer "${id}".`);
    if (layer.locked) throw new Error(`Assistant operation cannot edit locked layer "${id}".`);
    if (expectedType && layer.type !== expectedType) {
      throw new Error(`Assistant operation "${id}" requires a ${expectedType} layer.`);
    }
    return layer;
  };

  for (const operation of parsed) {
    if (operation.op === 'resizeCanvas') {
      if (Array.from(layers.values()).some((layer) => layer.locked)) {
        throw new Error('Canvas resizing would move locked layers. Unlock them before requesting a resize.');
      }
    } else if ('layerId' in operation) {
      const layer = assertLayer(operation.layerId, ['replaceText', 'translateText'].includes(operation.op) ? 'text' : undefined);
      if (operation.op === 'reorder' && layer.type === 'group') {
        throw new Error('Group layers cannot be reordered.');
      }
      if (operation.op === 'reorder'
        && operation.position >= Array.from(layers.values()).filter((item) => item.type !== 'group').length) {
        throw new Error(`Reorder position ${operation.position} is outside the layer list.`);
      }
      if (operation.op === 'updateLayer') {
        const updates = operation.updates;
        const textFields = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'align', 'stroke', 'shadow'];
        const shapeFields = ['strokeWidth', 'cornerRadius'];
        if (layer.type !== 'text' && textFields.some((key) => key in updates && updates[key as keyof typeof updates] !== undefined)) {
          throw new Error(`Assistant operation "${operation.layerId}" uses text styles on a ${layer.type} layer.`);
        }
        if (layer.type !== 'shape' && shapeFields.some((key) => key in updates && updates[key as keyof typeof updates] !== undefined)) {
          throw new Error(`Assistant operation "${operation.layerId}" uses shape styles on a ${layer.type} layer.`);
        }
        if ('fill' in updates && layer.type !== 'shape' && layer.type !== 'text') {
          throw new Error(`Assistant operation "${operation.layerId}" cannot change fill on a ${layer.type} layer.`);
        }
      }
      if (operation.op === 'deleteLayer') layers.delete(operation.layerId);
    } else if (operation.op === 'groupLayers') {
      for (const id of operation.layerIds) {
        const layer = assertLayer(id);
        if (layer.type === 'group') throw new Error('Groups cannot contain other groups.');
      }
      if (new Set(operation.layerIds).size !== operation.layerIds.length) {
        throw new Error('Group operations cannot contain duplicate layer ids.');
      }
    } else if (operation.op === 'createLayer') {
      if (operation.layer.type !== 'text' && operation.layer.type !== 'shape') {
        throw new Error('The assistant can only create editable text or shape layers.');
      }
      if (operation.layer.locked) throw new Error('The assistant cannot create locked layers.');
      if (layers.has(operation.layer.id)) {
        throw new Error(`Assistant operation creates duplicate layer "${operation.layer.id}".`);
      }
      layers.set(operation.layer.id, {
        id: operation.layer.id,
        type: operation.layer.type,
        name: operation.layer.name,
        x: operation.layer.x,
        y: operation.layer.y,
        width: operation.layer.width,
        height: operation.layer.height,
        zIndex: operation.layer.zIndex,
        ...(operation.layer.type === 'text' ? {
          fontSize: operation.layer.fontSize,
          fontFamily: operation.layer.fontFamily,
          fill: operation.layer.fill
        } : {}),
        locked: operation.layer.locked
      });
    }
  }
  return parsed;
}

function assertMutableLayer(layer: DesignLayer): void {
  if (layer.locked) throw new Error(`Layer "${layer.name}" is locked and cannot be changed by the assistant.`);
}

export function applyAssistantOperations(
  document: DesignDocument,
  operations: AssistantOperation[]
): DesignDocument {
  let next = structuredClone(document);
  const now = new Date().toISOString();

  for (const operation of operations) {
    if (operation.op === 'createLayer') {
      if (operation.layer.type !== 'text' && operation.layer.type !== 'shape') {
        throw new Error('The assistant can only create editable text or shape layers.');
      }
      if (operation.layer.locked) throw new Error('The assistant cannot create locked layers.');
      if (next.layers.some((layer) => layer.id === operation.layer.id)) {
        throw new Error(`Cannot create duplicate layer "${operation.layer.id}".`);
      }
      next.layers.push(structuredClone(operation.layer));
      continue;
    }
    if (operation.op === 'resizeCanvas') {
      const scale = Math.min(operation.width / next.canvas.width, operation.height / next.canvas.height);
      const offsetX = (operation.width - next.canvas.width * scale) / 2;
      const offsetY = (operation.height - next.canvas.height * scale) / 2;
      for (const layer of next.layers) {
        layer.x = layer.x * scale + offsetX;
        layer.y = layer.y * scale + offsetY;
        layer.width *= scale;
        layer.height *= scale;
        if (layer.type === 'text') layer.fontSize *= scale;
      }
      next.canvas.width = operation.width;
      next.canvas.height = operation.height;
      if (operation.unit) next.canvas.unit = operation.unit;
      continue;
    }
    if (operation.op === 'groupLayers') {
      const children = operation.layerIds.map((id) => next.layers.find((layer) => layer.id === id));
      if (children.some((layer) => !layer || layer.type === 'group')) {
        throw new Error('Groups must contain existing non-group layers.');
      }
      const actualChildren = children as DesignLayer[];
      const groupId = `group-${crypto.randomUUID()}`;
      const x = Math.min(...actualChildren.map((layer) => layer.x));
      const y = Math.min(...actualChildren.map((layer) => layer.y));
      const right = Math.max(...actualChildren.map((layer) => layer.x + layer.width));
      const bottom = Math.max(...actualChildren.map((layer) => layer.y + layer.height));
      const childIds = new Set(operation.layerIds);
      for (const oldGroup of next.layers) {
        if (oldGroup.type !== 'group') continue;
        oldGroup.childIds = oldGroup.childIds.filter((id) => !childIds.has(id));
      }
      next.layers = next.layers.filter((layer) => layer.type !== 'group' || layer.childIds.length > 0);
      actualChildren.forEach((layer) => { layer.groupId = groupId; });
      next.layers.push({
        id: groupId,
        type: 'group',
        name: operation.name ?? 'Group',
        x,
        y,
        width: right - x,
        height: bottom - y,
        rotation: 0,
        opacity: 1,
        zIndex: -1,
        locked: false,
        visible: true,
        source: { origin: 'user', originalBBox: null },
        confidence: null,
        needsReview: false,
        childIds: operation.layerIds
      });
      continue;
    }

    const layerId = 'layerId' in operation ? operation.layerId : '';
    const layerIndex = next.layers.findIndex((layer) => layer.id === layerId);
    const layer = next.layers[layerIndex];
    if (!layer) throw new Error(`Cannot edit unknown layer "${layerId}".`);
    assertMutableLayer(layer);

    switch (operation.op) {
      case 'updateLayer': {
        const updates = operation.updates;
        for (const key of ['name', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'visible'] as const) {
          if (updates[key] !== undefined) Object.assign(layer, { [key]: updates[key] });
        }
        if (layer.type === 'text') {
          if (updates.fontFamily !== undefined) layer.fontFamily = updates.fontFamily;
          if (updates.fontSize !== undefined) layer.fontSize = updates.fontSize;
          if (updates.fontWeight !== undefined) layer.fontWeight = updates.fontWeight;
          if (updates.fontStyle !== undefined) layer.fontStyle = updates.fontStyle;
          if (updates.lineHeight !== undefined) layer.lineHeight = updates.lineHeight;
          if (updates.letterSpacing !== undefined) layer.letterSpacing = updates.letterSpacing;
          if (updates.align !== undefined) layer.align = updates.align;
          if (updates.fill !== undefined) layer.fill = updates.fill;
          if (updates.stroke !== undefined) layer.stroke = updates.stroke;
          if (updates.shadow !== undefined) layer.shadow = updates.shadow;
        } else if (layer.type === 'shape') {
          if (updates.fill !== undefined) layer.fill = updates.fill;
          if (updates.strokeWidth !== undefined) layer.strokeWidth = updates.strokeWidth;
          if (updates.cornerRadius !== undefined) layer.cornerRadius = updates.cornerRadius;
        } else if (updates.fill !== undefined || updates.stroke !== undefined || updates.shadow !== undefined
          || updates.fontFamily !== undefined || updates.fontSize !== undefined || updates.fontWeight !== undefined
          || updates.fontStyle !== undefined || updates.lineHeight !== undefined || updates.letterSpacing !== undefined
          || updates.align !== undefined || updates.strokeWidth !== undefined || updates.cornerRadius !== undefined) {
          throw new Error(`The requested style update is not valid for ${layer.type} layer "${layer.name}".`);
        }
        break;
      }
      case 'deleteLayer': {
        next.layers.splice(layerIndex, 1);
        if (layer.type === 'group') {
          for (const child of next.layers) {
            if (child.groupId === layer.id) delete child.groupId;
          }
        } else if (layer.groupId) {
          const parent = next.layers.find((item) => item.id === layer.groupId && item.type === 'group');
          if (parent?.type === 'group') {
            parent.childIds = parent.childIds.filter((id) => id !== layer.id);
            if (parent.childIds.length === 0) next.layers = next.layers.filter((item) => item.id !== parent.id);
          }
        }
        break;
      }
      case 'moveLayer':
        layer.x = operation.x;
        layer.y = operation.y;
        break;
      case 'replaceText':
      case 'translateText':
        if (layer.type !== 'text') throw new Error(`Layer "${layer.name}" is not editable text.`);
        layer.text = operation.op === 'replaceText' ? operation.text : operation.translatedText;
        layer.lineBreaks = layer.text.split('\n').slice(0, -1).map((line, index, lines) =>
          lines.slice(0, index + 1).reduce((offset, item) => offset + item.length + 1, 0));
        break;
      case 'reorder': {
        const reorderable = next.layers.filter((item) => item.type !== 'group');
        if (operation.position >= reorderable.length) {
          throw new Error(`Reorder position ${operation.position} is outside the layer list.`);
        }
        const [moving] = reorderable.splice(reorderable.findIndex((item) => item.id === layer.id), 1);
        reorderable.splice(operation.position, 0, moving);
        reorderable.forEach((item, index) => { item.zIndex = index; });
        break;
      }
    }
  }

  next.updatedAt = now;
  return DesignDocumentSchema.parse(next);
}
