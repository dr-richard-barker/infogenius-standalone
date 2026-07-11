/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * infographicRenderer — the deterministic, in-browser replacement for the old
 * Gemini image-generation model.
 *
 * Given the researched title + facts and the user's Complexity / Visual Style /
 * Color Scheme / Background selections, it composes a self-contained SVG infographic.
 * Output is a `data:image/svg+xml` URL so it drops straight into the existing
 * <img> display, history grid, download and GitHub-sync code paths — but unlike a
 * diffusion raster it is vector, reproducible and text-accurate.
 */
import {
  ComplexityLevel,
  VisualStyle,
  ColorScheme,
  BackgroundColor,
} from '../types';

export interface InfographicSpec {
  title: string;
  facts: string[];
  level: ComplexityLevel;
  style: VisualStyle;
  colorScheme: ColorScheme;
  backgroundColor: BackgroundColor;
  sourceCount?: number;
  language?: string;
  /** Seed used by "restyle" to vary layout/accent without changing content. */
  variant?: number;
}

interface Palette {
  bg: string;
  bgGradient?: [string, string];
  panel: string;
  panelBorder: string;
  title: string;
  text: string;
  subtext: string;
  accent: string;
  accent2: string;
  numberText: string;
}

const W = 1200;
const H = 800;

// ---- Colour scheme palettes ------------------------------------------------

const COLOR_PALETTES: Record<ColorScheme, Palette> = {
  Default: {
    bg: '#f8fafc',
    panel: '#ffffff',
    panelBorder: '#e2e8f0',
    title: '#0f172a',
    text: '#1e293b',
    subtext: '#64748b',
    accent: '#0891b2',
    accent2: '#6366f1',
    numberText: '#ffffff',
  },
  'Black & White': {
    bg: '#ffffff',
    panel: '#ffffff',
    panelBorder: '#111111',
    title: '#000000',
    text: '#111111',
    subtext: '#555555',
    accent: '#000000',
    accent2: '#444444',
    numberText: '#ffffff',
  },
  'Vibrant (Red/Blue/Green/Yellow)': {
    bg: '#fffdf5',
    panel: '#ffffff',
    panelBorder: '#fde68a',
    title: '#1e3a8a',
    text: '#1f2937',
    subtext: '#6b7280',
    accent: '#dc2626',
    accent2: '#2563eb',
    numberText: '#ffffff',
  },
  'Pastel Soft': {
    bg: '#fdf4ff',
    panel: '#ffffff',
    panelBorder: '#f0d9ff',
    title: '#6b21a8',
    text: '#4c1d95',
    subtext: '#9d7bb0',
    accent: '#c084fc',
    accent2: '#5eead4',
    numberText: '#ffffff',
  },
  'Professional Earth Tones': {
    bg: '#f5f2ec',
    panel: '#fffdf9',
    panelBorder: '#d9cfc0',
    title: '#3f3527',
    text: '#4a4335',
    subtext: '#8a7f6b',
    accent: '#4d7c5a',
    accent2: '#1e3a5f',
    numberText: '#ffffff',
  },
  'Dark UI (Neon & Gradients)': {
    bg: '#0b1020',
    bgGradient: ['#0b1020', '#111a35'],
    panel: '#141d33',
    panelBorder: '#25335a',
    title: '#e6f9ff',
    text: '#c7d4f0',
    subtext: '#7f8fb5',
    accent: '#22d3ee',
    accent2: '#e879f9',
    numberText: '#0b1020',
  },
};

// ---- Background overrides --------------------------------------------------

const BACKGROUND_OVERRIDES: Partial<
  Record<BackgroundColor, { bg: string; gradient?: [string, string]; dark: boolean }>
> = {
  'Pure White': { bg: '#ffffff', dark: false },
  'Solid Black': { bg: '#000000', dark: true },
  'Deep Navy': { bg: '#0a1a3f', gradient: ['#0a1a3f', '#0f2557'], dark: true },
  'Neutral Gray': { bg: '#6b7280', dark: true },
  'Parchment/Cream': { bg: '#f4ecd8', dark: false },
  'Translucent Glass': { bg: '#e8eef7', gradient: ['#eef3fb', '#dfe7f4'], dark: false },
};

// ---- Style typography ------------------------------------------------------

const styleFonts = (
  style: VisualStyle
): { titleFont: string; bodyFont: string; titleWeight: number } => {
  switch (style) {
    case 'Vintage':
    case 'Sketch':
      return { titleFont: 'Cinzel, Georgia, serif', bodyFont: 'Georgia, serif', titleWeight: 700 };
    case 'Minimalist':
      return {
        titleFont: "'Space Grotesk', Helvetica, Arial, sans-serif",
        bodyFont: 'Helvetica, Arial, sans-serif',
        titleWeight: 500,
      };
    default:
      return {
        titleFont: "'Space Grotesk', 'Segoe UI', Arial, sans-serif",
        bodyFont: "'Inter', 'Segoe UI', Arial, sans-serif",
        titleWeight: 700,
      };
  }
};

// ---- Helpers ---------------------------------------------------------------

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Greedy word-wrap using an average glyph-width estimate for the font size. */
const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
  const avgChar = fontSize * 0.54;
  const maxChars = Math.max(6, Math.floor(maxWidth / avgChar));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const truncateLines = (lines: string[], maxLines: number): string[] => {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,;:\s]+$/, '') + '…';
  return kept;
};

const relativeLuminance = (hex: string): number => {
  const c = hex.replace('#', '');
  if (c.length !== 6) return 1;
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const levelTagline: Record<ComplexityLevel, string> = {
  Elementary: 'Simple Explainer',
  'High School': 'Study Brief',
  College: 'Academic Overview',
  Expert: 'Technical Digest',
};

// ---- Style decoration layer ------------------------------------------------

const styleDecoration = (style: VisualStyle, pal: Palette, dark: boolean): string => {
  const line = dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.045)';
  switch (style) {
    case 'Futuristic':
      return `
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="${pal.accent}" stroke-opacity="0.12" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#grid)"/>`;
    case 'Vintage':
    case 'Sketch':
      return `
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="${line}" stroke-width="1.2"/>
          </pattern>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#hatch)"/>`;
    case '3D Render':
      return `
        <defs>
          <radialGradient id="glow" cx="50%" cy="0%" r="90%">
            <stop offset="0%" stop-color="${pal.accent}" stop-opacity="0.16"/>
            <stop offset="100%" stop-color="${pal.accent}" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#glow)"/>`;
    case 'Minimalist':
      return '';
    default:
      return `
        <defs>
          <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.3" fill="${line}"/>
          </pattern>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#dots)"/>`;
  }
};

// ---- Main renderer ---------------------------------------------------------

export const renderInfographicSVG = (spec: InfographicSpec): string => {
  const {
    title,
    facts,
    level,
    style,
    colorScheme,
    backgroundColor,
    sourceCount = 0,
    language = 'English',
    variant = 0,
  } = spec;

  const base = COLOR_PALETTES[colorScheme] ?? COLOR_PALETTES.Default;
  const pal: Palette = { ...base };

  // Background override wins for the canvas fill; adjust text contrast if it flips dark/light.
  let dark = colorScheme === 'Dark UI (Neon & Gradients)';
  const bgOverride = BACKGROUND_OVERRIDES[backgroundColor];
  if (bgOverride) {
    pal.bg = bgOverride.bg;
    pal.bgGradient = bgOverride.gradient;
    dark = bgOverride.dark;
  } else {
    dark = relativeLuminance(pal.bg) < 0.4;
  }
  if (dark) {
    pal.title = colorScheme === 'Dark UI (Neon & Gradients)' ? pal.title : '#f8fafc';
    pal.text = colorScheme === 'Dark UI (Neon & Gradients)' ? pal.text : '#e2e8f0';
    pal.subtext = colorScheme === 'Dark UI (Neon & Gradients)' ? pal.subtext : '#94a3b8';
    pal.panel = colorScheme === 'Dark UI (Neon & Gradients)' ? pal.panel : 'rgba(255,255,255,0.06)';
    pal.panelBorder =
      colorScheme === 'Dark UI (Neon & Gradients)' ? pal.panelBorder : 'rgba(255,255,255,0.14)';
  }

  const { titleFont, bodyFont, titleWeight } = styleFonts(style);
  // "Restyle" swaps the two accents so a refine visibly changes the look.
  const accentA = variant % 2 === 1 ? pal.accent2 : pal.accent;
  const accentB = variant % 2 === 1 ? pal.accent : pal.accent2;

  const P = 64;
  const items = facts.slice(0, 6);
  const cols = items.length <= 3 ? 1 : 2;
  const rows = Math.ceil(items.length / cols);

  // --- Header ---
  const titleSize = title.length > 46 ? 40 : 50;
  const titleLines = truncateLines(wrapText(title, W - 2 * P - 200, titleSize), 2);
  const headerTop = P;
  const titleBlockH = titleLines.length * (titleSize + 6);
  const dividerY = headerTop + titleBlockH + 34;

  // --- Facts grid geometry ---
  const gridTop = dividerY + 34;
  const footerH = 74;
  const gridBottom = H - footerH - 20;
  const gap = 22;
  const cardW = (W - 2 * P - (cols - 1) * gap) / cols;
  const cardH = (gridBottom - gridTop - (rows - 1) * gap) / rows;

  const numberR = 19;
  const cardPad = 24;
  const bodySize = level === 'Elementary' ? 20 : level === 'Expert' ? 16 : 18;
  const lineH = bodySize + 8;
  const textX0 = cardPad + numberR * 2 + 14;
  const maxTextLines = Math.max(1, Math.floor((cardH - cardPad * 2 - 6) / lineH));

  const cards = items
    .map((fact, i) => {
      const col = cols === 1 ? 0 : i % cols;
      const row = cols === 1 ? i : Math.floor(i / cols);
      const x = P + col * (cardW + gap);
      const y = gridTop + row * (cardH + gap);
      const innerTextW = cardW - textX0 - cardPad;
      const lines = truncateLines(wrapText(fact, innerTextW, bodySize), maxTextLines);
      const textStartY = y + cardPad + bodySize;
      const roundedRect =
        style === 'Minimalist'
          ? ''
          : `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="16"
               fill="${pal.panel}" stroke="${pal.panelBorder}" stroke-width="1.5"/>`;
      const flatAccentBar =
        style === 'Minimalist'
          ? `<rect x="${x}" y="${y}" width="4" height="${cardH}" rx="2" fill="${
              i % 2 === 0 ? accentA : accentB
            }"/>`
          : '';
      const numCx = x + cardPad + numberR;
      const numCy = y + cardPad + numberR;
      const textLines = lines
        .map(
          (ln, li) =>
            `<text x="${x + textX0}" y="${textStartY + li * lineH}" font-family="${bodyFont}"
               font-size="${bodySize}" fill="${pal.text}">${esc(ln)}</text>`
        )
        .join('');
      return `
        <g>
          ${roundedRect}
          ${flatAccentBar}
          <circle cx="${numCx}" cy="${numCy}" r="${numberR}" fill="${
        i % 2 === 0 ? accentA : accentB
      }"/>
          <text x="${numCx}" y="${numCy + bodySize * 0.34}" text-anchor="middle"
            font-family="${titleFont}" font-size="${bodySize + 1}" font-weight="700"
            fill="${pal.numberText}">${i + 1}</text>
          ${textLines}
        </g>`;
    })
    .join('');

  // --- Background fill ---
  const bgFill = pal.bgGradient
    ? `<defs><linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="${pal.bgGradient[0]}"/>
         <stop offset="100%" stop-color="${pal.bgGradient[1]}"/>
       </linearGradient></defs>
       <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>`
    : `<rect width="${W}" height="${H}" fill="${pal.bg}"/>`;

  const titleTspans = titleLines
    .map(
      (ln, i) =>
        `<text x="${P}" y="${headerTop + 44 + i * (titleSize + 6)}" font-family="${titleFont}"
           font-size="${titleSize}" font-weight="${titleWeight}" fill="${pal.title}">${esc(
          ln
        )}</text>`
    )
    .join('');

  const badge = `
    <g>
      <rect x="${W - P - 190}" y="${headerTop + 6}" width="190" height="40" rx="20"
        fill="none" stroke="${accentA}" stroke-width="1.5"/>
      <circle cx="${W - P - 168}" cy="${headerTop + 26}" r="4" fill="${accentA}"/>
      <text x="${W - P - 152}" y="${headerTop + 31}" font-family="${bodyFont}" font-size="13"
        font-weight="700" fill="${accentA}" letter-spacing="1">${esc(
    levelTagline[level].toUpperCase()
  )}</text>
    </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(
    title
  )} infographic">
    ${bgFill}
    ${styleDecoration(style, pal, dark)}
    ${titleTspans}
    ${badge}
    <rect x="${P}" y="${dividerY}" width="${W - 2 * P}" height="3" rx="1.5" fill="${accentA}"/>
    <rect x="${P}" y="${dividerY}" width="120" height="3" rx="1.5" fill="${accentB}"/>
    ${cards}
    <text x="${P}" y="${H - 34}" font-family="${bodyFont}" font-size="14" fill="${pal.subtext}">
      ${sourceCount} cited source${sourceCount === 1 ? '' : 's'} &#183; ${esc(
    language
  )} &#183; Generated locally in-browser
    </text>
    <text x="${W - P}" y="${H - 34}" text-anchor="end" font-family="${titleFont}" font-size="14"
      font-weight="700" fill="${accentA}" letter-spacing="2">INFOGENIUS</text>
  </svg>`;

  return svg.replace(/\n\s+/g, '\n').trim();
};

/** Wrap an SVG string as a data URL (unicode-safe — handles non-Latin scripts). */
export const svgToDataUrl = (svg: string): string =>
  `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** Convenience: render a spec straight to an <img>-ready data URL. */
export const renderInfographic = (spec: InfographicSpec): string =>
  svgToDataUrl(renderInfographicSVG(spec));

/**
 * Rasterize an SVG data URL to a PNG data URL via an offscreen canvas.
 * Used for the "Download PNG" action and PNG GitHub sync.
 */
export const svgDataUrlToPng = (
  svgDataUrl: string,
  width = W,
  height = H
): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to rasterize SVG'));
    img.src = svgDataUrl;
  });
