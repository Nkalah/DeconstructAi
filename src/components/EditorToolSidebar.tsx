import React, { useRef, useState } from 'react';
import type { SceneGraph, Layer, MutationOperation } from '../types/sceneGraph';
import { Bot, Database, ImagePlus, LayoutTemplate, QrCode, Shapes, Sparkles, Type, Upload, WandSparkles } from 'lucide-react';

interface EditorToolSidebarProps {
  scene: SceneGraph;
  onExecuteMutation: (operation: MutationOperation) => void;
  onSelectLayerId: (layerId: string) => void;
  onOpenUpload: () => void;
  onOpenSmartData: () => void;
  onToggleAI: () => void;
  onLoadTemplate: () => void;
}

function iconLayer(scene: SceneGraph, id: string, name: string, iconName: string): Layer {
  return {
    id,
    name,
    type: 'icon',
    z_index: scene.layers.length + 1,
    transform: { x: scene.canvas.width * 0.35, y: scene.canvas.height * 0.4, width: 120, height: 120, rotation: 0 },
    opacity: 1,
    visible: true,
    locked: false,
    source: { detection_confidence: 1, extraction_method: 'user_added', warning_flags: [] },
    style: {
      effects: {
        shadow: { enabled: false, offset_x: 0, offset_y: 0, blur: 0, color: '#000000', opacity: 0 },
        stroke: { enabled: false, width: 0, color: '#000000' }
      }
    },
    type_specific: { icon_name: iconName, fill_color: '#38bdf8' }
  };
}

export const EditorToolSidebar: React.FC<EditorToolSidebarProps> = ({
  scene,
  onExecuteMutation,
  onSelectLayerId,
  onOpenUpload,
  onOpenSmartData,
  onToggleAI,
  onLoadTemplate
}) => {
  const imageInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const addText = () => {
    const layer: Layer = {
      id: `text-${crypto.randomUUID()}`,
      name: 'Heading',
      type: 'text',
      z_index: scene.layers.length + 1,
      transform: { x: scene.canvas.width * 0.15, y: scene.canvas.height * 0.25, width: scene.canvas.width * 0.7, height: 80, rotation: 0 },
      opacity: 1,
      visible: true,
      locked: false,
      source: { detection_confidence: 1, extraction_method: 'user_added', warning_flags: [] },
      style: { effects: { shadow: { enabled: false, offset_x: 0, offset_y: 0, blur: 0, color: '#000000', opacity: 0 }, stroke: { enabled: false, width: 0, color: '#000000' } } },
      type_specific: {
        content: 'Your text',
        font_family: 'Montserrat',
        font_family_confidence: 1,
        font_size: Math.round(scene.canvas.height * 0.06),
        font_weight: 700,
        color: '#111111',
        alignment: 'center',
        line_height: 1.2
      }
    };
    onExecuteMutation({ type: 'add_layer', params: { layer } });
  };

  const addShape = (kind: 'rect' | 'ellipse' | 'pill') => {
    const layer: Layer = {
      id: `shape-${crypto.randomUUID()}`,
      name: kind === 'ellipse' ? 'Circle' : kind === 'pill' ? 'Badge' : 'Rectangle',
      type: 'shape',
      z_index: scene.layers.length + 1,
      transform: { x: scene.canvas.width * 0.3, y: scene.canvas.height * 0.4, width: scene.canvas.width * 0.4, height: 120, rotation: 0 },
      opacity: 1,
      visible: true,
      locked: false,
      source: { detection_confidence: 1, extraction_method: 'user_added', warning_flags: [] },
      style: { effects: { shadow: { enabled: false, offset_x: 0, offset_y: 0, blur: 0, color: '#000000', opacity: 0 }, stroke: { enabled: false, width: 0, color: '#000000' } }, border_radius: kind === 'pill' ? 999 : 0 },
      type_specific: { shape_type: kind, fill_color: '#38bdf8' }
    };
    onExecuteMutation({ type: 'add_layer', params: { layer } });
  };

  const addQrCode = () => {
    const id = `qr-${crypto.randomUUID()}`;
    onExecuteMutation({ type: 'add_layer', params: { layer: iconLayer(scene, id, 'QR code', 'qr-code') } });
    onSelectLayerId(id);
  };

  const addImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('Choose an image file to add.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setStatus('Could not read that image.');
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setStatus('Could not read that image.');
        return;
      }
      const layer: Layer = {
        id: `image-${crypto.randomUUID()}`,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 64) || 'Image',
        type: 'image',
        z_index: scene.layers.length + 1,
        transform: { x: scene.canvas.width * 0.25, y: scene.canvas.height * 0.25, width: scene.canvas.width * 0.5, height: scene.canvas.height * 0.5, rotation: 0 },
        opacity: 1,
        visible: true,
        locked: false,
        source: { detection_confidence: 1, extraction_method: 'user_added', warning_flags: [] },
        style: { effects: { shadow: { enabled: false, offset_x: 0, offset_y: 0, blur: 0, color: '#000000', opacity: 0 }, stroke: { enabled: false, width: 0, color: '#000000' } } },
        type_specific: { image_url: reader.result, mask_shape: 'rect', replaceable: true }
      };
      onExecuteMutation({ type: 'add_layer', params: { layer } });
      setStatus(null);
    };
    reader.readAsDataURL(file);
  };

  const tools = [
    { label: 'Add Text', icon: Type, action: addText },
    { label: 'Image', icon: ImagePlus, action: () => imageInput.current?.click() },
    { label: 'Shape', icon: Shapes, action: () => addShape('rect') },
    { label: 'Upload', icon: Upload, action: onOpenUpload },
    { label: 'QR', icon: QrCode, action: addQrCode },
    { label: 'Smart data', icon: Database, action: onOpenSmartData },
    { label: 'Icons', icon: Sparkles, action: () => onExecuteMutation({ type: 'add_layer', params: { layer: iconLayer(scene, `icon-${crypto.randomUUID()}`, 'Star icon', 'star') } }) },
    { label: 'Templates', icon: LayoutTemplate, action: onLoadTemplate },
    { label: 'AI Tools', icon: WandSparkles, action: onToggleAI }
  ];

  return (
    <aside aria-label="Editor tools" className="flex w-[68px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-neutral-800 bg-neutral-900 py-2 sm:w-[76px]">
      <input ref={imageInput} type="file" accept="image/*" onChange={addImage} className="hidden" />
      {tools.map(({ label, icon: Icon, action }) => (
        <button
          key={label}
          type="button"
          onClick={action}
          aria-label={label}
          title={label}
          className="flex min-h-11 w-full flex-col items-center justify-center gap-1 px-1 text-[10px] text-neutral-300 transition hover:bg-neutral-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <Icon className="h-4 w-4 text-sky-300" />
          <span className="hidden sm:block">{label}</span>
        </button>
      ))}
      {status && <p role="alert" className="px-1 text-center text-[10px] text-rose-300">{status}</p>}
      <div className="mt-auto pb-2" title="Editor tools">
        <Bot className="h-4 w-4 text-neutral-600" />
      </div>
    </aside>
  );
};
