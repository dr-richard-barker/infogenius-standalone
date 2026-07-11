/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export type AspectRatio = '16:9' | '9:16' | '1:1';

export type ComplexityLevel = 'Elementary' | 'High School' | 'College' | 'Expert';

export type VisualStyle = 'Default' | 'Minimalist' | 'Realistic' | 'Cartoon' | 'Vintage' | 'Futuristic' | '3D Render' | 'Sketch';

export type ColorScheme = 'Default' | 'Black & White' | 'Vibrant (Red/Blue/Green/Yellow)' | 'Pastel Soft' | 'Professional Earth Tones' | 'Dark UI (Neon & Gradients)';

export type BackgroundColor = 'Default' | 'Pure White' | 'Solid Black' | 'Deep Navy' | 'Neutral Gray' | 'Parchment/Cream' | 'Translucent Glass';

export type Language = 'English' | 'Spanish' | 'French' | 'German' | 'Mandarin' | 'Japanese' | 'Hindi' | 'Arabic' | 'Portuguese' | 'Russian';

/**
 * Which engine composes the visual:
 * - 'svg'     : deterministic in-browser infographic (offline, always works)
 * - 'free-ai' : real AI image via a keyless public endpoint (Pollinations) — no token
 * - 'byok-ai' : real AI image via the user's own Gemini API key
 */
export type ImageEngine = 'svg' | 'free-ai' | 'byok-ai';

export interface GeneratedImage {
  id: string;
  data: string; // Data URL — SVG (image/svg+xml) produced locally in the browser
  prompt: string;
  timestamp: number;
  level?: ComplexityLevel;
  style?: VisualStyle;
  colorScheme?: ColorScheme;
  backgroundColor?: BackgroundColor;
  language?: Language;
  facts?: string[];
  title?: string;
  /** Deterministic SVG data URL to show if a remote AI image fails to load. */
  fallback?: string;
}

export interface SearchResultItem {
  title: string;
  url: string;
}

export interface ResearchResult {
  /** Human-readable topic title resolved from the knowledge source. */
  title: string;
  /** Extracted, summarized bullet facts (3–5) about the topic. */
  facts: string[];
  /** A short prose summary paragraph. */
  summary: string;
  /** Cited sources (real article URLs) backing the facts. */
  searchResults: SearchResultItem[];
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch: string;
  autoSync: boolean;
}

export interface BatchItem {
  id: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}
