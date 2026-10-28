import { createEmptyDocument } from '../core/schema/designDocument';

export const BEGINNER_DESIGN_PRESETS = [
  { id: 'a4-flyer', label: 'A4 flyer', width: 2480, height: 3508, group: 'Print sizes' },
  { id: 'a5-flyer', label: 'A5 flyer', width: 1748, height: 2480, group: 'Print sizes' },
  { id: 'instagram-post', label: 'Instagram post', width: 1080, height: 1080, group: 'Social sizes' },
  { id: 'instagram-story', label: 'Instagram story', width: 1080, height: 1920, group: 'Social sizes' },
  { id: 'whatsapp-status', label: 'WhatsApp status', width: 1080, height: 1920, group: 'Social sizes' },
  { id: 'business-card', label: 'Business card', width: 1050, height: 600, group: 'Ideas' },
  { id: 'event-poster', label: 'Event poster', width: 1080, height: 1350, group: 'Ideas' },
  { id: 'birthday-invitation', label: 'Birthday invitation', width: 1080, height: 1350, group: 'Ideas' },
  { id: 'church-announcement', label: 'Church/event announcement', width: 1080, height: 1350, group: 'Ideas' },
  { id: 'restaurant-promotion', label: 'Restaurant/food promotion', width: 1080, height: 1350, group: 'Ideas' },
  { id: 'product-ad', label: 'Product ad', width: 1080, height: 1080, group: 'Ideas' },
  { id: 'sale-poster', label: 'Sale/discount poster', width: 1080, height: 1350, group: 'Ideas' },
  { id: 'school-event', label: 'School/university event', width: 1080, height: 1350, group: 'Ideas' },
  { id: 'service-ad', label: 'Service ad', width: 1080, height: 1350, group: 'Ideas' },
] as const;

export type BeginnerDesignPresetId = typeof BEGINNER_DESIGN_PRESETS[number]['id'];

export interface BeginnerDesignOverrides {
  name?: string;
  width?: number;
  height?: number;
}

export function createBeginnerDesignDocument(
  presetId: BeginnerDesignPresetId,
  overrides: BeginnerDesignOverrides = {}
) {
  const preset = BEGINNER_DESIGN_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Unknown beginner design preset: ${presetId}`);

  const width = overrides.width ?? preset.width;
  const height = overrides.height ?? preset.height;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 30000 ||
    height > 30000 ||
    width * height > 100_000_000
  ) {
    throw new Error('Design dimensions must be whole pixels, no more than 30,000 per side, and no more than 100 million pixels total.');
  }

  return createEmptyDocument({
    name: overrides.name?.trim() || `Untitled ${preset.label}`,
    width,
    height,
    unit: 'px',
  });
}
