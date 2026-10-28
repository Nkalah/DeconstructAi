export interface SamplePoster {
  id: string;
  title: string;
  category: string;
  description: string;
  width: number;
  height: number;
  aspectRatio: string;
  svgDataUri: string;
  thumbnailSvg: string;
}

function createSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

export const SAMPLE_POSTERS: SamplePoster[] = [
  {
    id: 'sample-tech-summit',
    title: 'Future AI Summit 2026',
    category: 'Conference / Keynote',
    description: 'Clean vector tech flyer with bold sans-serif headline, avatar photo, badge, date & speaker block.',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    svgDataUri: createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <clipPath id="circleClip">
      <circle cx="540" cy="520" r="190" />
    </clipPath>
  </defs>

  <!-- Background Layer -->
  <rect width="1080" height="1350" fill="url(#bg)" />
  
  <!-- Decorative Background Shapes -->
  <circle cx="150" cy="200" r="280" fill="#4338ca" opacity="0.25" />
  <circle cx="950" cy="1100" r="320" fill="#ec4899" opacity="0.15" />
  <rect x="120" y="110" width="180" height="38" rx="19" fill="url(#glow)" />
  <text x="210" y="135" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="700" font-size="16" text-anchor="middle" letter-spacing="3">ANNUAL KEYNOTE</text>

  <!-- Main Headline -->
  <text x="120" y="220" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="900" font-size="64" letter-spacing="-1">FUTURE AI</text>
  <text x="120" y="285" fill="#818cf8" font-family="Montserrat, sans-serif" font-weight="900" font-size="64" letter-spacing="-1">SUMMIT 2026</text>
  
  <!-- Subheadline -->
  <text x="120" y="325" fill="#94a3b8" font-family="Inter, sans-serif" font-weight="500" font-size="22">Autonomous Intelligence, Human Interfaces &amp; Compute</text>

  <!-- Decorative Speaker Ring -->
  <circle cx="540" cy="520" r="202" fill="none" stroke="url(#glow)" stroke-width="6" />
  
  <!-- Speaker Photo with Clip -->
  <g clip-path="url(#circleClip)">
    <rect x="340" y="320" width="400" height="400" fill="#1e293b" />
    <!-- Stylized Speaker Vector Silhouette/Illustration -->
    <circle cx="540" cy="460" r="85" fill="#cbd5e1" />
    <path d="M400,680 C400,560 460,535 540,535 C620,535 680,560 680,680 Z" fill="#94a3b8" />
    <rect x="470" y="580" width="140" height="120" fill="#3b82f6" />
  </g>

  <!-- Speaker Name Badge -->
  <rect x="380" y="735" width="320" height="60" rx="12" fill="#0f172a" stroke="#334155" stroke-width="2" />
  <text x="540" y="765" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="700" font-size="20" text-anchor="middle">DR. ELENA VANCE</text>
  <text x="540" y="785" fill="#a5b4fc" font-family="Inter, sans-serif" font-weight="500" font-size="14" text-anchor="middle">VP of Neural Architecture at Synapse Lab</text>

  <!-- Date, Location and Details Card -->
  <rect x="120" y="860" width="840" height="200" rx="20" fill="#1e1e38" fill-opacity="0.8" stroke="#4338ca" stroke-width="2" />
  
  <text x="170" y="930" fill="#ec4899" font-family="Montserrat, sans-serif" font-weight="700" font-size="18" letter-spacing="2">DATE &amp; TIME</text>
  <text x="170" y="970" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="800" font-size="28">OCTOBER 14, 2026</text>
  <text x="170" y="1005" fill="#94a3b8" font-family="Inter, sans-serif" font-weight="500" font-size="16">09:00 AM – 06:30 PM PST</text>

  <line x1="530" y1="895" x2="530" y2="1025" stroke="#334155" stroke-width="2" />

  <text x="580" y="930" fill="#818cf8" font-family="Montserrat, sans-serif" font-weight="700" font-size="18" letter-spacing="2">LOCATION</text>
  <text x="580" y="970" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="800" font-size="28">METROPOLIS PAVILION</text>
  <text x="580" y="1005" fill="#94a3b8" font-family="Inter, sans-serif" font-weight="500" font-size="16">San Francisco, California • Hall 4A</text>

  <!-- CTA Button & Footer -->
  <rect x="360" y="1120" width="360" height="74" rx="37" fill="url(#glow)" />
  <text x="540" y="1165" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="800" font-size="22" text-anchor="middle" letter-spacing="1">RESERVE YOUR PASS</text>

  <text x="540" y="1250" fill="#64748b" font-family="Inter, sans-serif" font-weight="500" font-size="16" text-anchor="middle">www.futureaisummit2026.io • Limited Seating</text>
</svg>
    `),
    thumbnailSvg: `<svg viewBox="0 0 100 125" fill="#0b0f19"><rect width="100" height="125" fill="#1e1b4b"/><circle cx="50" cy="48" r="16" fill="#6366f1"/><rect x="15" y="80" width="70" height="18" rx="3" fill="#312e81"/></svg>`
  },
  {
    id: 'sample-music-festival',
    title: 'Neon Nights Music Fest',
    category: 'Festival / Concert',
    description: 'Vibrant festival poster with tall condensed display typography, energetic geometry, date/venue and ticket info.',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    svgDataUri: createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
  <defs>
    <linearGradient id="festBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="40%" stop-color="#27272a" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="neonOrange" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff7a00" />
      <stop offset="100%" stop-color="#ff0055" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1080" height="1350" fill="url(#festBg)" />

  <!-- Geometric Pattern Accents -->
  <polygon points="0,0 450,0 0,600" fill="#ff7a00" opacity="0.12" />
  <polygon points="1080,400 1080,1100 650,800" fill="#ff0055" opacity="0.1" />

  <!-- Badge Top -->
  <rect x="420" y="80" width="240" height="42" rx="21" fill="#ff0055" />
  <text x="540" y="108" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="800" font-size="15" text-anchor="middle" letter-spacing="4">3 DAYS LIVE</text>

  <!-- Super Bold Condensed Headline -->
  <text x="540" y="240" fill="#ffffff" font-family="'Bebas Neue', sans-serif" font-size="130" text-anchor="middle" letter-spacing="4">NEON NIGHTS</text>
  <text x="540" y="340" fill="#ff7a00" font-family="'Bebas Neue', sans-serif" font-size="100" text-anchor="middle" letter-spacing="6">MUSIC FESTIVAL</text>

  <!-- Lineup Container -->
  <rect x="100" y="420" width="880" height="440" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="2" />
  
  <text x="540" y="480" fill="#e4e4e7" font-family="Montserrat, sans-serif" font-weight="900" font-size="32" text-anchor="middle">HEADLINERS</text>
  <text x="540" y="540" fill="#ff0055" font-family="'Bebas Neue', sans-serif" font-size="52" text-anchor="middle" letter-spacing="2">TYCHO • BONOBO • ODESZA</text>
  <text x="540" y="600" fill="#38bdf8" font-family="'Bebas Neue', sans-serif" font-size="44" text-anchor="middle" letter-spacing="2">CARIBOU • FOUR TET • LANE 8</text>
  <text x="540" y="660" fill="#fbbf24" font-family="Montserrat, sans-serif" font-weight="700" font-size="24" text-anchor="middle">JON HOPKINS • BICEP • MODERAT</text>

  <!-- Horizontal divider -->
  <line x1="200" y1="710" x2="880" y2="710" stroke="#27272a" stroke-width="2" />
  <text x="540" y="760" fill="#a1a1aa" font-family="Inter, sans-serif" font-weight="500" font-size="18" text-anchor="middle">+ OVER 40 UNDERGROUND ARTISTS ACROSS 3 STAGES</text>
  <text x="540" y="800" fill="#ff7a00" font-family="Inter, sans-serif" font-weight="700" font-size="16" text-anchor="middle">IMMERSIVE VISUAL INSTALLATIONS &amp; CRAFT FOOD MARKET</text>

  <!-- Date and Venue -->
  <rect x="140" y="920" width="380" height="150" rx="12" fill="#27272a" />
  <text x="330" y="970" fill="#ff0055" font-family="Montserrat, sans-serif" font-weight="700" font-size="16">DATES</text>
  <text x="330" y="1015" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="800" font-size="26">AUG 28-30, 2026</text>
  <text x="330" y="1045" fill="#a1a1aa" font-family="Inter, sans-serif" font-size="15">Gates Open at 2:00 PM</text>

  <rect x="560" y="920" width="380" height="150" rx="12" fill="#27272a" />
  <text x="750" y="970" fill="#ff7a00" font-family="Montserrat, sans-serif" font-weight="700" font-size="16">VENUE</text>
  <text x="750" y="1015" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="800" font-size="26">SILVER LAKE PARK</text>
  <text x="750" y="1045" fill="#a1a1aa" font-family="Inter, sans-serif" font-size="15">Austin, TX • Outdoor Amphitheater</text>

  <!-- CTA -->
  <rect x="340" y="1130" width="400" height="76" rx="38" fill="url(#neonOrange)" />
  <text x="540" y="1178" fill="#ffffff" font-family="Montserrat, sans-serif" font-weight="900" font-size="22" text-anchor="middle" letter-spacing="2">TICKETS ON SALE NOW</text>
  <text x="540" y="1255" fill="#71717a" font-family="Inter, sans-serif" font-size="15" text-anchor="middle">www.neonnightsfest.com • Ages 18+ Only</text>
</svg>
    `),
    thumbnailSvg: `<svg viewBox="0 0 100 125" fill="#18181b"><rect width="100" height="125" fill="#09090b"/><text x="50" y="35" fill="#ff7a00" font-size="16" text-anchor="middle">NEON</text><rect x="15" y="55" width="70" height="40" rx="2" fill="#27272a"/></svg>`
  },
  {
    id: 'sample-coffee-roasters',
    title: 'Artisanal Coffee & Roasters Expo',
    category: 'Exhibition / Food & Beverage',
    description: 'Earthy, high-contrast poster with editorial typography, badge shapes, and balanced information hierarchy.',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    svgDataUri: createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
  <!-- Solid Warm Earth Background -->
  <rect width="1080" height="1350" fill="#2b1810" />

  <!-- Outer Border Frame -->
  <rect x="40" y="40" width="1000" height="1270" fill="none" stroke="#d4a373" stroke-width="3" stroke-dasharray="12 6" />

  <!-- Top Badge -->
  <text x="540" y="130" fill="#d4a373" font-family="Inter, sans-serif" font-weight="700" font-size="18" text-anchor="middle" letter-spacing="6">PACIFIC NORTHWEST SPECIALTY</text>

  <!-- Editorial Headline -->
  <text x="540" y="240" fill="#faedcd" font-family="'Playfair Display', serif" font-weight="700" font-size="78" text-anchor="middle">THE ARTISANAL</text>
  <text x="540" y="325" fill="#e9edc9" font-family="'Playfair Display', serif" font-weight="700" font-size="78" text-anchor="middle">COFFEE EXPO</text>

  <!-- Circular Decorative Emblem/Graphic -->
  <circle cx="540" cy="510" r="140" fill="#3a2216" stroke="#d4a373" stroke-width="4" />
  <circle cx="540" cy="510" r="120" fill="none" stroke="#d4a373" stroke-width="1" />
  <text x="540" y="480" fill="#faedcd" font-family="'Playfair Display', serif" font-weight="900" font-size="44" text-anchor="middle">EST.</text>
  <text x="540" y="540" fill="#faedcd" font-family="'Playfair Display', serif" font-weight="900" font-size="52" text-anchor="middle">2026</text>
  <text x="540" y="585" fill="#d4a373" font-family="Inter, sans-serif" font-weight="700" font-size="14" text-anchor="middle" letter-spacing="3">SEATTLE, WA</text>

  <!-- Description Body -->
  <text x="540" y="720" fill="#faedcd" font-family="Inter, sans-serif" font-weight="500" font-size="22" text-anchor="middle">Join 80+ Master Roasters, Origin Importers &amp; Barista Champions</text>
  <text x="540" y="755" fill="#ccd5ae" font-family="Inter, sans-serif" font-weight="400" font-size="18" text-anchor="middle">Featuring Cupping Sessions, Latte Art Throwdowns &amp; Sustainable Farming Talks</text>

  <!-- Details Ribbon -->
  <rect x="140" y="830" width="800" height="170" rx="10" fill="#3a2216" stroke="#d4a373" stroke-width="1.5" />
  
  <text x="320" y="900" fill="#d4a373" font-family="Inter, sans-serif" font-weight="700" font-size="16" text-anchor="middle" letter-spacing="2">EVENT DATE</text>
  <text x="320" y="945" fill="#faedcd" font-family="'Playfair Display', serif" font-weight="700" font-size="28" text-anchor="middle">NOV 07 - 09</text>
  <text x="320" y="975" fill="#e9edc9" font-family="Inter, sans-serif" font-size="14" text-anchor="middle">Friday through Sunday</text>

  <line x1="540" y1="860" x2="540" y2="970" stroke="#d4a373" stroke-width="1" />

  <text x="740" y="900" fill="#d4a373" font-family="Inter, sans-serif" font-weight="700" font-size="16" text-anchor="middle" letter-spacing="2">VENUE</text>
  <text x="740" y="945" fill="#faedcd" font-family="'Playfair Display', serif" font-weight="700" font-size="28" text-anchor="middle">PIER 66 MARITIME</text>
  <text x="740" y="975" fill="#e9edc9" font-family="Inter, sans-serif" font-size="14" text-anchor="middle">Bell Harbor International</text>

  <!-- Ticket CTA -->
  <rect x="360" y="1060" width="360" height="70" rx="8" fill="#d4a373" />
  <text x="540" y="1104" fill="#2b1810" font-family="Inter, sans-serif" font-weight="800" font-size="20" text-anchor="middle" letter-spacing="2">GET TASTING PASSES</text>

  <text x="540" y="1190" fill="#ccd5ae" font-family="Inter, sans-serif" font-size="16" text-anchor="middle">Early bird passes include commemorative ceramic tasting cup</text>
</svg>
    `),
    thumbnailSvg: `<svg viewBox="0 0 100 125" fill="#2b1810"><rect width="100" height="125" fill="#2b1810"/><rect x="5" y="5" width="90" height="115" fill="none" stroke="#d4a373"/><circle cx="50" cy="50" r="14" fill="#3a2216"/><text x="50" y="30" fill="#faedcd" font-size="8" text-anchor="middle">COFFEE</text></svg>`
  }
];
