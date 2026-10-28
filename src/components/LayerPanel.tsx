import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  FileImage,
  Group,
  Image as ImageIcon,
  Layers,
  Lock,
  Search,
  Square,
  Trash2,
  Type,
  Unlock,
  Ungroup,
} from 'lucide-react';
import type { DesignDocument } from '../core/schema/designDocument';
import type { Layer, MutationOperation, SceneGraph } from '../types/sceneGraph';

interface LayerPanelProps {
  scene: SceneGraph;
  document: DesignDocument;
  selectedLayerIds: string[];
  onSelectLayerIds: (ids: string[]) => void;
  onExecuteMutation: (operation: MutationOperation) => void;
  onDuplicateLayers: (ids: string[]) => void;
  onDeleteLayers: (ids: string[]) => void;
  onGroupLayers: (ids: string[]) => void;
  onUngroupLayers: (ids: string[]) => void;
  onOpenFailureReview?: () => void;
}

const REGION_ORDER = ['header', 'main', 'services', 'contact', 'footer', 'ungrouped'];

function regionLabel(id: string, groupNames: Map<string, string>): string {
  if (groupNames.has(id)) return groupNames.get(id)!;
  if (id === 'ungrouped') return 'Other layers';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function layerText(layer: Layer): string {
  if (layer.type === 'text') return layer.type_specific.content;
  if (layer.type === 'image') return layer.type_specific.object_label ?? '';
  if (layer.type === 'icon') return layer.type_specific.icon_name;
  if (layer.type === 'shape') return layer.type_specific.shape_type;
  return layer.type_specific.fill_type;
}

function typeIcon(layer: Layer) {
  if (layer.type === 'text') return <Type className="h-4 w-4" aria-hidden="true" />;
  if (layer.type === 'image') return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
  if (layer.type === 'icon') return <CircleHelp className="h-4 w-4" aria-hidden="true" />;
  if (layer.type === 'background_fill') return <FileImage className="h-4 w-4" aria-hidden="true" />;
  return <Square className="h-4 w-4" aria-hidden="true" />;
}

function thumbnail(layer: Layer) {
  const imageSource = layer.type === 'image'
    ? layer.type_specific.image_url
    : layer.type === 'icon'
      ? layer.type_specific.image_url
      : layer.type === 'background_fill'
        ? layer.type_specific.reconstructed_image_url
        : undefined;
  if (imageSource) {
    return <img src={imageSource} alt="" className="h-9 w-9 rounded object-cover" draggable={false} />;
  }
  if (layer.type === 'text') {
    return (
      <span
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded bg-neutral-950 px-1 text-[9px] leading-tight text-neutral-100"
        style={{
          color: layer.type_specific.color,
          fontFamily: layer.type_specific.font_family,
          fontWeight: layer.type_specific.font_weight,
        }}
        aria-hidden="true"
      >
        {layer.type_specific.content.slice(0, 5) || 'Text'}
      </span>
    );
  }
  if (layer.type === 'shape') {
    return (
      <span
        className="h-7 w-7 rounded-sm border border-white/20"
        style={{ background: layer.type_specific.fill_color === 'transparent' ? '#27272a' : layer.type_specific.fill_color }}
        aria-hidden="true"
      />
    );
  }
  return <span className="flex h-9 w-9 items-center justify-center rounded bg-neutral-800 text-neutral-300">{typeIcon(layer)}</span>;
}

const iconButton = 'inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';

export const LayerPanel: React.FC<LayerPanelProps> = ({
  scene,
  document,
  selectedLayerIds,
  onSelectLayerIds,
  onExecuteMutation,
  onDuplicateLayers,
  onDeleteLayers,
  onGroupLayers,
  onUngroupLayers,
  onOpenFailureReview,
}) => {
  const [query, setQuery] = useState('');
  const [groupByRegion, setGroupByRegion] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const cancelRenameRef = useRef(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const groupNames = useMemo(
    () => new Map(document.layers.filter((layer) => layer.type === 'group').map((layer) => [layer.id, layer.name])),
    [document.layers],
  );

  const layers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...scene.layers]
      .filter((layer) => normalizedQuery === ''
        || `${layer.name} ${layer.type} ${layerText(layer)}`.toLocaleLowerCase().includes(normalizedQuery))
      .sort((left, right) => right.z_index - left.z_index);
  }, [query, scene.layers]);

  const groups = useMemo(() => {
    const buckets = new Map<string, Layer[]>();
    for (const layer of layers) {
      const documentLayer = document.layers.find((entry) => entry.id === layer.id);
      const key = groupByRegion ? documentLayer?.groupId ?? 'ungrouped' : 'all';
      const bucket = buckets.get(key) ?? [];
      bucket.push(layer);
      buckets.set(key, bucket);
    }
    const sortedKeys = [...buckets.keys()].sort((left, right) => {
      if (left === 'all') return -1;
      if (right === 'all') return 1;
      const leftKnown = REGION_ORDER.indexOf(left);
      const rightKnown = REGION_ORDER.indexOf(right);
      if (leftKnown !== -1 || rightKnown !== -1) {
        return (leftKnown === -1 ? REGION_ORDER.length : leftKnown) - (rightKnown === -1 ? REGION_ORDER.length : rightKnown);
      }
      return regionLabel(left, groupNames).localeCompare(regionLabel(right, groupNames));
    });
    return sortedKeys.map((key) => [key, buckets.get(key)!] as const);
  }, [document.layers, groupByRegion, groupNames, layers]);

  const selectedLayers = scene.layers.filter((layer) => selectedLayerIds.includes(layer.id));
  const reorderableCount = scene.layers.filter((layer) => layer.type !== 'background_fill').length;
  const selectedCanGroup = selectedLayers.filter((layer) => layer.type !== 'background_fill');
  const selectedHasGroups = selectedLayers.some((layer) =>
    document.layers.some((item) => item.id === layer.id && item.groupId),
  );
  const totalWarnings = scene.layers.filter((layer) =>
    layer.source.warning_flags?.length || layer.source.detection_confidence < 0.75
      || (layer.type === 'text' && layer.type_specific.uncertain),
  ).length;
  const lockedSelection = selectedLayers.every((layer) => layer.locked || layer.type === 'background_fill');

  const toggleSelected = (event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, layerId: string) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      onSelectLayerIds(selectedLayerIds.includes(layerId)
        ? selectedLayerIds.filter((id) => id !== layerId)
        : [...selectedLayerIds, layerId]);
    } else {
      onSelectLayerIds([layerId]);
    }
  };

  const runForSelected = (type: 'toggle_visibility' | 'toggle_lock', values: Record<string, unknown>) => {
    const operations = selectedLayers
      .filter((layer) => layer.type !== 'background_fill')
      .map((layer) => ({ type, layer_id: layer.id, params: values })) as MutationOperation[];
    if (operations.length) onExecuteMutation({
      type: 'batch_mutation',
      params: { mutations: operations },
      description: type === 'toggle_lock' ? 'Updated selected layer locks' : 'Updated selected layer visibility',
    });
  };

  const renameLayer = (layer: Layer) => {
    const name = editingName.trim();
    setEditingId(null);
    if (name && name !== layer.name) {
      onExecuteMutation({ type: 'rename_layer', layer_id: layer.id, params: { name } });
    }
  };

  const moveLayerTo = (layer: Layer, newZIndex: number) => {
    if (layer.type === 'background_fill') return;
    onExecuteMutation({
      type: 'reorder_layer',
      layer_id: layer.id,
      params: { new_z_index: newZIndex },
    });
  };

  const moveLayerBeside = (layer: Layer, target: Layer, after: boolean) => {
    if (layer.type === 'background_fill' || target.type === 'background_fill') return;
    onExecuteMutation({
      type: 'reorder_layer',
      layer_id: layer.id,
      params: { [after ? 'before_layer_id' : 'after_layer_id']: target.id, new_z_index: target.z_index },
    });
  };

  const renderLayerRow = (layer: Layer) => {
    const isSelected = selectedLayerIds.includes(layer.id);
    const confidence = Math.round(layer.source.detection_confidence * 100);
    const needsReview = Boolean(
      layer.source.warning_flags?.length
      || confidence < 75
      || (layer.type === 'text' && (layer.type_specific.uncertain || layer.type_specific.font_family_confidence < 0.75)),
    );
    const nonBackground = layer.type !== 'background_fill';
    return (
      <div
        key={layer.id}
        draggable={nonBackground && editingId !== layer.id}
        onDragStart={(event) => {
          setDraggedId(layer.id);
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', layer.id);
        }}
        onDragEnd={() => setDraggedId(null)}
        onDragOver={(event) => {
          if (draggedId && draggedId !== layer.id && nonBackground) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceId = draggedId || event.dataTransfer.getData('text/plain');
          const source = scene.layers.find((entry) => entry.id === sourceId);
          if (!source || source.id === layer.id || layer.type === 'background_fill') return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const insertAfter = event.clientY > bounds.top + bounds.height / 2;
          moveLayerBeside(source, layer, insertAfter);
          setDraggedId(null);
        }}
        className={`rounded-lg border transition ${
          isSelected
            ? 'border-sky-500/50 bg-sky-500/10'
            : 'border-transparent hover:border-neutral-700 hover:bg-neutral-800/60'
        } ${!layer.visible ? 'opacity-60' : ''} ${draggedId === layer.id ? 'opacity-40' : ''}`}
      >
        <div
          role="option"
          aria-selected={isSelected}
          tabIndex={0}
          onClick={(event) => toggleSelected(event, layer.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleSelected(event, layer.id);
            }
            if (event.key === 'F2') {
              event.preventDefault();
              setEditingId(layer.id);
              setEditingName(layer.name);
            }
          }}
          onDoubleClick={() => {
            setEditingId(layer.id);
            setEditingName(layer.name);
          }}
          className="flex min-h-[60px] cursor-pointer items-center gap-2 px-2"
        >
          <span className="cursor-grab text-neutral-600" aria-label="Drag to reorder" title="Drag to reorder">⋮⋮</span>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-neutral-800 text-neutral-300">{typeIcon(layer)}</span>
          <span className="shrink-0">{thumbnail(layer)}</span>
          <span className="min-w-0 flex-1">
            {editingId === layer.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={(event) => setEditingName(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onBlur={() => {
                  if (cancelRenameRef.current) {
                    cancelRenameRef.current = false;
                    setEditingId(null);
                    return;
                  }
                  renameLayer(layer);
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    cancelRenameRef.current = true;
                    event.currentTarget.blur();
                  }
                }}
                aria-label={`Rename ${layer.name}`}
                className="min-h-9 w-full rounded border border-sky-500 bg-neutral-950 px-2 text-xs text-neutral-100 outline-none"
              />
            ) : (
              <>
                <span className="block truncate text-xs font-medium text-neutral-100" title={layer.name}>{layer.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-neutral-500" title={layerText(layer)}>
                  {layerText(layer) || layer.type.replace('_', ' ')}
                </span>
                {layer.type === 'image' && layer.source.extraction_method === 'raster' && (
                  <span className="mt-1 inline-flex rounded border border-neutral-600 px-1.5 py-0.5 text-[9px] text-neutral-300">
                    Raster background
                  </span>
                )}
                {layer.source.warning_flags?.includes('foreground_not_isolated') && (
                  <span
                    className="mt-1 inline-flex rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-200"
                    title="This is a locked rectangular raster crop with surrounding pixels; it is not an isolated foreground object."
                  >
                    Raster — not fully editable
                  </span>
                )}
              </>
            )}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-[9px] leading-tight text-neutral-400">
            <span className="font-mono">z {layer.z_index}</span>
            <span className="whitespace-nowrap" aria-label={`Confidence ${confidence} percent`}>
              {confidence}% confidence
            </span>
            {needsReview && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-amber-200" title="This layer needs review">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {layer.source.warning_flags?.includes('foreground_not_isolated') ? 'Not isolated' : 'Needs review'}
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-end gap-1 px-2 pb-1.5">
          <button
            type="button"
            disabled={!nonBackground || layer.source.warning_flags?.includes('foreground_not_isolated')}
            onClick={() => onExecuteMutation({ type: 'toggle_lock', layer_id: layer.id, params: { locked: !layer.locked } })}
            className={iconButton}
            title={layer.source.warning_flags?.includes('foreground_not_isolated') ? 'Raster crop is not independently editable' : layer.locked ? 'Unlock layer' : 'Lock layer'}
            aria-label={layer.source.warning_flags?.includes('foreground_not_isolated') ? `${layer.name} is not independently editable` : layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
          >
            {layer.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => onExecuteMutation({ type: 'toggle_visibility', layer_id: layer.id, params: { visible: !layer.visible } })}
            className={iconButton}
            title={layer.visible ? 'Hide layer' : 'Show layer'}
            aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
          >
            {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside className="flex h-full w-72 min-w-0 flex-col border-r border-neutral-800 bg-neutral-900/95 text-neutral-100" aria-label="Layers panel">
      <div className="space-y-3 border-b border-neutral-800 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-sky-300" aria-hidden="true" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">Layers</h2>
            <span className="rounded-full bg-neutral-800 px-2 py-0.5 font-mono text-[10px] text-neutral-400">{scene.layers.length}</span>
          </div>
          {totalWarnings > 0 && onOpenFailureReview && (
            <button
              type="button"
              onClick={onOpenFailureReview}
              className="inline-flex min-h-10 items-center gap-1 rounded border border-amber-500/30 px-2 text-[10px] text-amber-100 hover:bg-amber-500/10"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Review {totalWarnings}
            </button>
          )}
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search layers"
            aria-label="Search layers"
            className="min-h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 pl-9 pr-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-sky-500"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={selectedLayers.length === 0}
            onClick={() => runForSelected('toggle_lock', { locked: !lockedSelection })}
            className="min-h-10 rounded border border-neutral-700 px-2 text-[10px] text-neutral-200 disabled:opacity-40"
          >
            {lockedSelection ? 'Unlock selected' : 'Lock selected'}
          </button>
          <button
            type="button"
            disabled={selectedLayers.length === 0}
            onClick={() => runForSelected('toggle_visibility', { visible: selectedLayers.some((layer) => !layer.visible) })}
            className="min-h-10 rounded border border-neutral-700 px-2 text-[10px] text-neutral-200 disabled:opacity-40"
          >
            {selectedLayers.some((layer) => !layer.visible) ? 'Show selected' : 'Hide selected'}
          </button>
          <button
            type="button"
            disabled={selectedCanGroup.length < 2}
            onClick={() => onGroupLayers(selectedLayerIds)}
            className="inline-flex min-h-10 items-center gap-1 rounded border border-neutral-700 px-2 text-[10px] text-neutral-200 disabled:opacity-40"
          >
            <Group className="h-3.5 w-3.5" aria-hidden="true" /> Group
          </button>
          <button
            type="button"
            disabled={!selectedHasGroups}
            onClick={() => onUngroupLayers(selectedLayerIds)}
            className="inline-flex min-h-10 items-center gap-1 rounded border border-neutral-700 px-2 text-[10px] text-neutral-200 disabled:opacity-40"
          >
            <Ungroup className="h-3.5 w-3.5" aria-hidden="true" /> Ungroup
          </button>
          <button
            type="button"
            disabled={selectedLayers.length === 0}
            onClick={() => onDuplicateLayers(selectedLayerIds)}
            className="inline-flex min-h-10 items-center gap-1 rounded border border-neutral-700 px-2 text-[10px] text-neutral-200 disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Duplicate
          </button>
          <button
            type="button"
            disabled={selectedLayers.length === 0}
            onClick={() => onDeleteLayers(selectedLayerIds)}
            className="inline-flex min-h-10 items-center gap-1 rounded border border-neutral-700 px-2 text-[10px] text-neutral-200 hover:text-rose-200 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-neutral-800 pt-2">
          <span className="text-[10px] text-neutral-500">{selectedLayerIds.length} selected · Shift/Ctrl-click for more</span>
          <div className="flex gap-1">
            {([
              ['forward', 'Forward', ArrowUp, reorderableCount],
              ['backward', 'Backward', ArrowDown, 1],
              ['front', 'To front', ArrowUpToLine, reorderableCount],
              ['back', 'To back', ArrowDownToLine, 1],
            ] as const).map(([key, label, Icon, fallback]) => {
              const layer = selectedLayers.length === 1 ? selectedLayers[0] : null;
              const currentPosition = layer?.z_index ?? 0;
              const newPosition = key === 'forward'
                ? currentPosition + 1
                : key === 'backward'
                  ? currentPosition - 1
                  : fallback;
              const disabled = !layer || layer.type === 'background_fill'
                || (key === 'forward' && currentPosition >= reorderableCount)
                || (key === 'backward' && currentPosition <= 1)
                || (key === 'front' && currentPosition >= reorderableCount)
                || (key === 'back' && currentPosition <= 1);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => layer && moveLayerTo(layer, newPosition)}
                  title={label}
                  aria-label={label}
                  className={iconButton}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setGroupByRegion((value) => !value)}
          aria-pressed={groupByRegion}
          className="flex min-h-10 w-full items-center justify-between rounded border border-neutral-800 px-2 text-left text-[11px] text-neutral-300 hover:bg-neutral-800"
        >
          Group by detected region
          <span>{groupByRegion ? 'On' : 'Off'}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.map(([groupId, groupLayers]) => {
          const collapsed = collapsedGroups.has(groupId);
          return (
            <section key={groupId} className="mb-3" aria-label={regionLabel(groupId, groupNames)}>
              {groupByRegion && (
                <button
                  type="button"
                  onClick={() => setCollapsedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(groupId)) next.delete(groupId);
                    else next.add(groupId);
                    return next;
                  })}
                  className="flex min-h-10 w-full items-center gap-1.5 px-1 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
                >
                  {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {regionLabel(groupId, groupNames)}
                  <span className="font-mono text-neutral-600">({groupLayers.length})</span>
                </button>
              )}
              {!collapsed && <div role="listbox" aria-multiselectable="true" className="space-y-1">{groupLayers.map(renderLayerRow)}</div>}
            </section>
          );
        })}
        {layers.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-neutral-500">No layers match “{query}”.</p>
        )}
      </div>

      <div className="border-t border-neutral-800 px-3 py-2.5 text-[10px] leading-relaxed text-neutral-500">
        Double-click a layer name to rename it. Drag rows to change stacking order.
      </div>
    </aside>
  );
};
