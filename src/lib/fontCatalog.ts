import { FontCandidate } from '../types/sceneGraph';

export interface CatalogFont {
  family: string;
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
  weights: number[];
  traits: string[];
}

export interface FontMatchStyle {
  familyHint?: string;
  category?: string;
  weight?: string | number;
  isCondensed?: boolean;
}

export interface SafeFontMatch {
  topFont: string;
  confidence: number;
  candidates: FontCandidate[];
  isApproximate: boolean;
  failed: boolean;
}

export const CURATED_POSTER_FONTS: CatalogFont[] = [
  { family: 'Montserrat', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], traits: ['modern', 'geometric', 'clean', 'bold'] },
  { family: 'Inter', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], traits: ['neutral', 'legible', 'corporate'] },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 600, 700, 800], traits: ['modern', 'rounded', 'clean'] },
  { family: 'Poppins', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], traits: ['geometric', 'friendly', 'round'] },
  { family: 'Lato', category: 'sans-serif', weights: [400, 700, 900], traits: ['humanist', 'warm', 'readable'] },
  { family: 'Open Sans', category: 'sans-serif', weights: [400, 600, 700, 800], traits: ['neutral', 'readable', 'humanist'] },
  { family: 'Raleway', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], traits: ['elegant', 'geometric', 'thin'] },
  { family: 'Nunito Sans', category: 'sans-serif', weights: [400, 600, 700, 800, 900], traits: ['rounded', 'friendly', 'soft'] },
  { family: 'Space Grotesk', category: 'sans-serif', weights: [400, 500, 600, 700], traits: ['technical', 'geometric', 'modern'] },
  { family: 'Sora', category: 'sans-serif', weights: [400, 500, 600, 700, 800], traits: ['geometric', 'modern', 'tech'] },
  { family: 'Oswald', category: 'display', weights: [400, 500, 600, 700], traits: ['condensed', 'punchy', 'tall'] },
  { family: 'Barlow Condensed', category: 'display', weights: [400, 500, 600, 700, 800, 900], traits: ['condensed', 'technical', 'sport'] },
  { family: 'Bebas Neue', category: 'display', weights: [400], traits: ['condensed', 'headline', 'impactful', 'all-caps'] },
  { family: 'Anton', category: 'display', weights: [400], traits: ['heavy', 'condensed', 'poster'] },
  { family: 'Archivo Black', category: 'display', weights: [400], traits: ['heavy', 'bold', 'headline'] },
  { family: 'Abril Fatface', category: 'display', weights: [400], traits: ['high-contrast', 'editorial', 'decorative'] },
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900], traits: ['elegant', 'editorial', 'luxury'] },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], traits: ['editorial', 'readable', 'contemporary'] },
  { family: 'Merriweather', category: 'serif', weights: [300, 400, 700, 900], traits: ['sturdy', 'formal', 'readable'] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [300, 400, 500, 600, 700], traits: ['high-contrast', 'classic', 'elegant'] },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700], traits: ['traditional', 'editorial', 'literary'] },
  { family: 'Cinzel', category: 'serif', weights: [400, 500, 600, 700, 800, 900], traits: ['inscriptional', 'formal', 'classic'] },
  { family: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700], traits: ['casual', 'marker', 'personal'] },
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700], traits: ['script', 'elegant', 'personal'] },
  { family: 'Pacifico', category: 'handwriting', weights: [400], traits: ['brush', 'fun', 'retro'] },
  { family: 'Permanent Marker', category: 'handwriting', weights: [400], traits: ['marker', 'bold', 'casual'] },
  { family: 'IBM Plex Mono', category: 'monospace', weights: [400, 500, 600, 700], traits: ['technical', 'typewriter', 'monospace'] }
];

export const SAFE_GENERIC_FALLBACKS: Record<string, { family: string; category: FontCandidate['category'] }> = {
  'bold_condensed_sans': { family: 'Bebas Neue', category: 'display' },
  'modern_sans': { family: 'Montserrat', category: 'sans-serif' },
  'neutral_sans': { family: 'Inter', category: 'sans-serif' },
  'high_contrast_serif': { family: 'Playfair Display', category: 'serif' },
  'traditional_serif': { family: 'Libre Baskerville', category: 'serif' },
  'script_casual': { family: 'Caveat', category: 'handwriting' },
  'monospace': { family: 'IBM Plex Mono', category: 'monospace' },
};

export function matchFontCandidates(detectedStyle: FontMatchStyle): { topFont: string; confidence: number; candidates: FontCandidate[]; isApproximate: boolean } {
  const normalizedHint = (detectedStyle.familyHint || '').toLowerCase();
  
  // Exact or close substring match in catalog
  const directMatch = CURATED_POSTER_FONTS.find(f => 
    normalizedHint.includes(f.family.toLowerCase()) || f.family.toLowerCase().includes(normalizedHint)
  );

  if (directMatch && normalizedHint.length > 2) {
    const candidates: FontCandidate[] = [
      { family: directMatch.family, confidence: 0.94, category: directMatch.category },
      ...CURATED_POSTER_FONTS.filter(f => f.family !== directMatch.family && f.category === directMatch.category)
        .slice(0, 2)
        .map(f => ({ family: f.family, confidence: 0.72, category: f.category }))
    ];
    return {
      topFont: directMatch.family,
      confidence: 0.94,
      candidates,
      isApproximate: false,
    };
  }

  // Heuristic style classification match
  let targetCategory: CatalogFont['category'] = 'sans-serif';
  let targetKey = 'modern_sans';

  if (detectedStyle.isCondensed || normalizedHint.includes('condensed') || normalizedHint.includes('bebas') || normalizedHint.includes('impact')) {
    targetKey = 'bold_condensed_sans';
    targetCategory = 'display';
  } else if (detectedStyle.category === 'display') {
    targetCategory = 'display';
  } else if (detectedStyle.category === 'serif' || normalizedHint.includes('serif') || normalizedHint.includes('playfair') || normalizedHint.includes('roman')) {
    targetKey = 'high_contrast_serif';
    targetCategory = 'serif';
  } else if (detectedStyle.category === 'handwriting' || detectedStyle.category === 'script' || normalizedHint.includes('script') || normalizedHint.includes('hand')) {
    targetKey = 'script_casual';
    targetCategory = 'handwriting';
  } else if (detectedStyle.category === 'monospace') {
    targetKey = 'monospace';
    targetCategory = 'monospace';
  }

  const fallback = SAFE_GENERIC_FALLBACKS[targetKey] || {
    family: targetCategory === 'display' ? 'Anton' : 'Montserrat',
    category: targetCategory
  };

  const candidatesInCategory = CURATED_POSTER_FONTS.filter((font) => font.category === targetCategory);
  const preferred = candidatesInCategory.find((font) => font.family === fallback.family)
    ?? candidatesInCategory[0]
    ?? CURATED_POSTER_FONTS[0];
  const related = candidatesInCategory.filter((font) => font.family !== preferred.family);
  const candidates: FontCandidate[] = [
    { family: preferred.family, confidence: 0.65, category: preferred.category },
    ...related.slice(0, 2).map((font, index) => ({
      family: font.family,
      confidence: 0.58 - index * 0.08,
      category: font.category
    }))
  ];

  return {
    topFont: preferred.family,
    confidence: 0.65,
    candidates,
    isApproximate: true, // Marked as approximate font per Section 8
  };
}

export function matchFontCandidatesSafely(
  detectedStyle: FontMatchStyle,
  matcher: (style: FontMatchStyle) => Omit<SafeFontMatch, 'failed'> = matchFontCandidates
): SafeFontMatch {
  try {
    return { ...matcher(detectedStyle), failed: false };
  } catch {
    const hint = `${detectedStyle.category ?? ''} ${detectedStyle.familyHint ?? ''}`.toLowerCase();
    const category: FontCandidate['category'] = detectedStyle.isCondensed || /condensed|display|impact/.test(hint)
      ? 'display'
      : /serif|roman/.test(hint) ? 'serif'
        : /script|handwriting/.test(hint) ? 'handwriting'
          : /mono/.test(hint) ? 'monospace'
            : 'sans-serif';
    const fallbackFamilies: Record<FontCandidate['category'], string[]> = {
      'sans-serif': ['Montserrat', 'Inter', 'Open Sans'],
      serif: ['Playfair Display', 'Lora', 'Libre Baskerville'],
      display: ['Bebas Neue', 'Oswald', 'Anton'],
      handwriting: ['Caveat', 'Dancing Script', 'Pacifico'],
      monospace: ['IBM Plex Mono']
    };
    const candidates = fallbackFamilies[category].map((family, index) => ({
      family,
      confidence: Math.max(0.2, 0.4 - index * 0.08),
      category
    }));
    return {
      topFont: candidates[0].family,
      confidence: candidates[0].confidence,
      candidates,
      isApproximate: true,
      failed: true
    };
  }
}
