/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * freeImageService — REAL AI image generation with NO API key and NO token.
 *
 * Uses the public Pollinations image endpoint, which generates an image directly
 * from a URL: `https://image.pollinations.ai/prompt/<text>`. The image is consumed
 * as a plain `<img src>` (no fetch / no CORS / no Turnstile challenge), so it works
 * from a static site with zero credentials. There is nothing to install and nothing
 * to pay for.
 *
 * Trade-off vs. the deterministic SVG: the image is fetched from a third-party service
 * (needs an internet connection and can be slow), and because it is cross-origin it
 * cannot be re-encoded to base64 in-browser — so it is shown by URL and downloaded via
 * a new tab rather than rasterized/synced. The SVG engine remains the offline fallback.
 */
import {
  ComplexityLevel,
  VisualStyle,
  ColorScheme,
  BackgroundColor,
  Language,
} from '../types';
import { buildImagePrompt } from './aiImageService';

const POLLINATIONS = 'https://image.pollinations.ai/prompt/';

/** Deterministic non-negative seed from a string (stable across reloads). */
export const seedFrom = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 1_000_000;
};

/**
 * Build a keyless Pollinations image URL for a researched topic.
 * The generated image is deterministic for a given (prompt, seed).
 */
export const buildFreeImageUrl = (
  title: string,
  facts: string[],
  level: ComplexityLevel,
  style: VisualStyle,
  colorScheme: ColorScheme,
  backgroundColor: BackgroundColor,
  language: Language,
  seed: number
): string => {
  const prompt = buildImagePrompt(
    title,
    facts,
    level,
    style,
    colorScheme,
    backgroundColor,
    language
  );
  const params = new URLSearchParams({
    width: '1024',
    height: '768',
    nologo: 'true',
    model: 'flux',
    seed: String(seed),
  });
  return `${POLLINATIONS}${encodeURIComponent(prompt)}?${params.toString()}`;
};
