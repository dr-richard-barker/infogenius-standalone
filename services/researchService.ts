/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * researchService — the keyless, browser-native replacement for the old Gemini +
 * Google Search grounding step.
 *
 * It performs the same job the prototype did: given a topic it mines a knowledge
 * source for facts and returns a summarized set of bullet facts plus the real
 * source URLs that back them. Instead of a paid LLM it uses the public, CORS-enabled
 * Wikipedia REST + MediaWiki APIs — no API key, no account, no server.
 */
import { ResearchResult, SearchResultItem, Language } from '../types';

// Wikipedia has one wiki per language; map the UI Language to its subdomain code.
const LANGUAGE_WIKI: Record<Language, string> = {
  English: 'en',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Mandarin: 'zh',
  Japanese: 'ja',
  Hindi: 'hi',
  Arabic: 'ar',
  Portuguese: 'pt',
  Russian: 'ru',
};

interface SearchHit {
  title: string;
  pageid: number;
}

const api = (lang: string) => `https://${lang}.wikipedia.org/w/api.php`;

interface SearchResponse {
  hits: SearchHit[];
  suggestion: string | null;
}

/**
 * One Wikipedia search request. `origin=*` opts into anonymous CORS. Also asks for
 * the engine's "did you mean" suggestion so we can recover from typos.
 */
const searchArticles = async (query: string, lang: string): Promise<SearchResponse> => {
  const url =
    `${api(lang)}?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
    `&srlimit=6&srinfo=suggestion&srprop=&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = await res.json();
  const hits = (json?.query?.search ?? []).map((h: any) => ({ title: h.title, pageid: h.pageid }));
  const suggestion = json?.query?.searchinfo?.suggestion ?? null;
  return { hits, suggestion };
};

/**
 * Resilient search: real queries (especially niche scientific ones with several
 * keywords, or a typo) often return nothing for the exact phrase. Cascade:
 *   1. the full query
 *   2. the engine's spelling suggestion ("did you mean")
 *   3. progressively drop trailing words (broaden the phrase)
 *   4. try each significant word alone, most-specific (longest) first
 * Returns [] only if every attempt is empty. The FIRST request may throw on a real
 * network failure, which we let propagate so the UI can say "couldn't reach Wikipedia".
 */
const findHits = async (query: string, lang: string): Promise<SearchHit[]> => {
  const first = await searchArticles(query, lang);
  if (first.hits.length) return first.hits;

  const tried = new Set<string>([query.toLowerCase()]);
  const attempt = async (q: string): Promise<SearchHit[] | null> => {
    const key = q.trim().toLowerCase();
    if (!key || tried.has(key)) return null;
    tried.add(key);
    try {
      const r = await searchArticles(q, lang);
      return r.hits.length ? r.hits : null;
    } catch {
      return null; // ignore individual fallback failures
    }
  };

  // 2. spelling suggestion (recovers "ggplant" -> "eggplant", etc.)
  if (first.suggestion) {
    const r = await attempt(first.suggestion);
    if (r) return r;
  }

  const words = query.split(/\s+/).filter(Boolean);

  // 3. drop trailing words to broaden (cap the work at a handful of tries)
  for (let n = words.length - 1; n >= 1; n--) {
    const r = await attempt(words.slice(0, n).join(' '));
    if (r) return r;
  }

  // 4. each significant word alone, longest (most specific) first
  const singles = [...new Set(words.filter((w) => w.length >= 3))].sort(
    (a, b) => b.length - a.length
  );
  for (const w of singles) {
    const r = await attempt(w);
    if (r) return r;
  }

  return [];
};

/** Fetch the plain-text intro extract for a specific article. */
const fetchExtract = async (title: string, lang: string): Promise<string> => {
  const url =
    `${api(lang)}?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1` +
    `&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Extract failed (${res.status})`);
  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  const first: any = Object.values(pages)[0];
  return (first?.extract as string) || '';
};

/** Split prose into clean sentences, discarding fragments and residual markup. */
const splitSentences = (text: string): string[] => {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\([^)]*\)/g, ' ') // drop parenthetical asides (pronunciations, dates)
    .replace(/\s+/g, ' ')
    .trim();
  // Split on sentence terminators followed by a space + capital / digit.
  const raw = cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9À-ɏ])/);
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 320 && /[a-zÀ-ɏ]/i.test(s));
};

/**
 * Extractive summarizer: rank sentences by information signals (position, length,
 * presence of topic terms and numbers) and take the strongest N. This is the
 * deterministic, local stand-in for the LLM's "FACTS:" list.
 */
const summarizeFacts = (text: string, topic: string, maxFacts: number): string[] => {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const topicTerms = topic
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    let score = 0;
    // Lead sentences carry the definition — weight earlier ones higher.
    score += Math.max(0, 6 - index) * 1.5;
    // Topic relevance.
    topicTerms.forEach((t) => {
      if (lower.includes(t)) score += 2;
    });
    // Concrete facts often contain numbers / dates / units.
    if (/\d/.test(sentence)) score += 1.5;
    // Prefer medium-length, well-formed sentences.
    if (sentence.length > 60 && sentence.length < 200) score += 1;
    return { sentence, index, score };
  });

  // Take the top-scoring sentences, then restore original reading order.
  const top = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFacts)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);

  return top;
};

/** How many facts to surface for a given audience complexity. */
const factCountForLevel = (level: string): number => {
  switch (level) {
    case 'Elementary':
      return 3;
    case 'High School':
      return 4;
    case 'College':
      return 5;
    case 'Expert':
      return 6;
    default:
      return 4;
  }
};

export const researchTopic = async (
  topic: string,
  level: string,
  language: Language
): Promise<ResearchResult> => {
  const lang = LANGUAGE_WIKI[language] ?? 'en';
  const query = topic.trim();
  if (!query) throw new Error('Please enter a topic to research.');

  let hits: SearchHit[];
  try {
    hits = await findHits(query, lang);
  } catch (e) {
    throw new Error(
      'Could not reach Wikipedia. Check your internet connection and try again.'
    );
  }

  // No encyclopedic match anywhere in the cascade — degrade gracefully rather than
  // fail. The caller can still generate an image directly from the user's text.
  if (hits.length === 0) {
    return { title: query, facts: [], summary: '', searchResults: [] };
  }

  // Best match = first hit. Pull its extract; if empty, fall back to the next hit.
  let chosen = hits[0];
  let extract = await fetchExtract(chosen.title, lang).catch(() => '');
  if (!extract && hits[1]) {
    chosen = hits[1];
    extract = await fetchExtract(chosen.title, lang).catch(() => '');
  }

  // Sources = the related articles surfaced by the search, as real, clickable URLs.
  const searchResults: SearchResultItem[] = hits.slice(0, 6).map((h) => ({
    title: h.title,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
  }));
  const uniqueResults = Array.from(
    new Map(searchResults.map((item) => [item.url, item])).values()
  );

  // Article found but no readable summary — still return the title + sources.
  if (!extract) {
    return { title: chosen.title, facts: [], summary: '', searchResults: uniqueResults };
  }

  const facts = summarizeFacts(extract, topic, factCountForLevel(level));
  const summarySentences = splitSentences(extract).slice(0, 2).join(' ');

  return {
    title: chosen.title,
    facts: facts.length > 0 ? facts : [summarySentences],
    summary: summarySentences,
    searchResults: uniqueResults,
  };
};
