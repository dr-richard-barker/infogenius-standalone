/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * aiImageService — OPTIONAL, bring-your-own-key AI image generation.
 *
 * The app is fully functional and keyless by default (deterministic SVG infographics).
 * This module is only ever used if the user explicitly enables "AI Image" mode and
 * pastes their own Google Gemini API key. It is deliberately implemented with plain
 * `fetch` against the public Generative Language REST endpoint — there is NO
 * `@google/genai` package and no Google code bundled in the repo or the build. The
 * key lives only in the user's browser localStorage and is sent only to Google's API,
 * only at generation time.
 */
import {
  ComplexityLevel,
  VisualStyle,
  ColorScheme,
  BackgroundColor,
  Language,
} from '../types';

export interface AiImageConfig {
  apiKey: string;
  model: string;
  enabled: boolean;
}

export const DEFAULT_AI_MODEL = 'gemini-3-pro-image-preview';

const REST_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// --- Prompt instruction builders (plain descriptive text; no Google SDK) -----

const levelInstruction = (level: ComplexityLevel): string => {
  switch (level) {
    case 'Elementary':
      return 'Target Audience: Elementary School (Ages 6-10). Style: Bright, simple, fun. Large clear icons, minimal text labels.';
    case 'High School':
      return 'Target Audience: High School. Style: Standard Textbook. Clean lines, clear labels, accurate diagrams.';
    case 'College':
      return 'Target Audience: University. Style: Academic Journal. High detail, data-rich, precise cross-sections.';
    case 'Expert':
      return 'Target Audience: Industry Expert. Style: Technical Blueprint. Extremely dense detail, precise annotations.';
    default:
      return 'Target Audience: General Public. Style: Clear and engaging.';
  }
};

const styleInstruction = (style: VisualStyle): string => {
  switch (style) {
    case 'Minimalist':
      return 'Aesthetic: Bauhaus Minimalist. Flat vector art, 2-3 colors, negative space, simple geometry.';
    case 'Realistic':
      return 'Aesthetic: Photorealistic Composite. Cinematic lighting, 8k, detailed textures.';
    case 'Cartoon':
      return 'Aesthetic: Educational Comic. Vibrant colors, thick outlines, cel-shaded.';
    case 'Vintage':
      return 'Aesthetic: 19th Century Scientific Lithograph. Engraving style, sepia, textured paper, fine hatch lines.';
    case 'Futuristic':
      return 'Aesthetic: Cyberpunk HUD. Glowing neon cyan lines on dark background, holographic data, 3D wireframes.';
    case '3D Render':
      return 'Aesthetic: 3D Isometric Render. Claymorphism/high-gloss, studio lighting, soft shadows.';
    case 'Sketch':
      return 'Aesthetic: Da Vinci Notebook. Ink on parchment sketch, handwritten annotation style.';
    default:
      return 'Aesthetic: High-quality digital scientific illustration. Clean, modern, detailed.';
  }
};

const colorInstruction = (color: ColorScheme): string => {
  switch (color) {
    case 'Black & White':
      return 'Color Palette: High-contrast black on white, grayscale shading only.';
    case 'Vibrant (Red/Blue/Green/Yellow)':
      return 'Color Palette: Bold primary red, blue, green, yellow, purple with colorful gradients.';
    case 'Pastel Soft':
      return 'Color Palette: Muted pastels — soft pinks, mint, lavender. High readability, low strain.';
    case 'Professional Earth Tones':
      return 'Color Palette: Corporate earth tones — deep blues, forest greens, rich browns.';
    case 'Dark UI (Neon & Gradients)':
      return 'Color Palette: Dark mode — deep navy/black with neon cyan, magenta, lime; glassmorphism and glowing gradients.';
    default:
      return 'Color Palette: Balanced natural scientific colors suitable for the topic.';
  }
};

const backgroundInstruction = (bg: BackgroundColor): string => {
  switch (bg) {
    case 'Pure White':
      return 'Background: Solid flat pure white (#FFFFFF).';
    case 'Solid Black':
      return 'Background: Solid deep black (#000000), high contrast.';
    case 'Deep Navy':
      return 'Background: Uniform dark navy blue.';
    case 'Neutral Gray':
      return 'Background: Neutral medium gray.';
    case 'Parchment/Cream':
      return 'Background: Aged parchment / light cream texture.';
    case 'Translucent Glass':
      return 'Background: Frosted glass / translucent blurred abstract.';
    default:
      return 'Background: Clean, appropriate solid background that enhances visibility.';
  }
};

export const buildImagePrompt = (
  title: string,
  facts: string[],
  level: ComplexityLevel,
  style: VisualStyle,
  colorScheme: ColorScheme,
  backgroundColor: BackgroundColor,
  language: Language
): string => {
  const factList = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  return [
    `Create a detailed, information-dense infographic poster about "${title}".`,
    `Incorporate and visually organize these researched facts (labels in ${language}):`,
    factList,
    '',
    levelInstruction(level),
    styleInstruction(style),
    colorInstruction(colorScheme),
    backgroundInstruction(backgroundColor),
    '',
    'Layout: clear title header, numbered/segmented sections, icons and diagrams, legible labels. Do not include citations or watermarks.',
  ].join('\n');
};

// --- REST calls --------------------------------------------------------------

const extractInlineImage = (json: any): string => {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part?.inlineData?.data) {
      const mime = part.inlineData.mimeType || 'image/png';
      return `data:${mime};base64,${part.inlineData.data}`;
    }
  }
  const msg =
    json?.error?.message ||
    json?.promptFeedback?.blockReason ||
    'The model returned no image. Try a different model id or prompt.';
  throw new Error(msg);
};

const callGenerateContent = async (
  apiKey: string,
  model: string,
  parts: any[]
): Promise<string> => {
  const url = `${REST_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `Gemini API error (${res.status})`);
  }
  return extractInlineImage(json);
};

/** Generate a raster infographic image from a text prompt. Returns a PNG data URL. */
export const generateAiImage = async (
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> => {
  if (!apiKey) throw new Error('No API key provided.');
  return callGenerateContent(apiKey, model || DEFAULT_AI_MODEL, [{ text: prompt }]);
};

/** Edit an existing raster image with a natural-language instruction. */
export const editAiImage = async (
  apiKey: string,
  model: string,
  currentImageDataUrl: string,
  instruction: string
): Promise<string> => {
  if (!apiKey) throw new Error('No API key provided.');
  const match = currentImageDataUrl.match(/^data:(image\/[a-z+]+);base64,(.*)$/i);
  if (!match) throw new Error('Current image is not a raster image that can be edited by AI.');
  const [, mimeType, data] = match;
  return callGenerateContent(apiKey, model || DEFAULT_AI_MODEL, [
    { inlineData: { mimeType, data } },
    { text: instruction },
  ]);
};
