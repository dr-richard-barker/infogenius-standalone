/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  GeneratedImage,
  ComplexityLevel,
  VisualStyle,
  Language,
  SearchResultItem,
  GitHubConfig,
  BatchItem,
  ColorScheme,
  BackgroundColor,
  ImageEngine,
} from './types';
import { researchTopic } from './services/researchService';
import { renderInfographic } from './services/infographicRenderer';
import {
  AiImageConfig,
  DEFAULT_AI_MODEL,
  buildImagePrompt,
  generateAiImage,
  editAiImage,
} from './services/aiImageService';
import { buildFreeImageUrl, seedFrom } from './services/freeImageService';
import Infographic from './components/Infographic';
import Loading from './components/Loading';
import IntroScreen from './components/IntroScreen';
import SearchResults from './components/SearchResults';
import {
  Search, AlertCircle, History, GraduationCap, Palette, Microscope,
  Atom, Sun, Moon, Github, CheckCircle2, Sparkles, Wand2, ExternalLink,
  XCircle, Play, Layers, X, FileText, Send, Square, Pipette, Paintbrush,
} from 'lucide-react';

// File extension for a generated-image data URL (SVG vector vs AI raster PNG).
const extForData = (data: string): string =>
  data.startsWith('data:image/svg+xml') ? 'svg' : 'png';

// Unicode-safe base64 for GitHub Contents API payloads (SVG / CSV text).
const toBase64Utf8 = (str: string): string =>
  btoa(unescape(encodeURIComponent(str)));

// Pull the raw SVG markup back out of a `data:image/svg+xml,...` URL.
const svgFromDataUrl = (dataUrl: string): string =>
  decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml,?/, ''));

// Small string hash → stable variant seed for deterministic "restyle".
const hashSeed = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const App: React.FC = () => {
  const [showIntro, setShowIntro] = useState(true);
  const [topic, setTopic] = useState('');
  const [complexityLevel, setComplexityLevel] = useState<ComplexityLevel>('High School');
  const [imageEngine, setImageEngine] = useState<ImageEngine>('free-ai');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('Default');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('Default');
  const [backgroundColor, setBackgroundColor] = useState<BackgroundColor>('Default');
  const [language, setLanguage] = useState<Language>('English');

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [loadingFacts, setLoadingFacts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [imageHistory, setImageHistory] = useState<GeneratedImage[]>([]);
  const [currentSearchResults, setCurrentSearchResults] = useState<SearchResultItem[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // GitHub & Batch States
  const [showGhSettings, setShowGhSettings] = useState(false);
  const [ghConfig, setGhConfig] = useState<GitHubConfig>({
    token: '',
    owner: '',
    repo: '',
    path: 'images',
    branch: 'main',
    autoSync: false,
  });
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const stopBatchRef = useRef(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Optional bring-your-own-key AI image generation (off by default; keyless SVG otherwise).
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiImageConfig>({
    apiKey: '',
    model: DEFAULT_AI_MODEL,
    enabled: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Load GitHub Config from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('infogenius_gh_config');
    if (saved) {
      try {
        setGhConfig(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved GH config', e);
      }
    }
  }, []);

  const saveGhConfig = (config: GitHubConfig) => {
    setGhConfig(config);
    localStorage.setItem('infogenius_gh_config', JSON.stringify(config));
  };

  // Load / save optional AI image config + chosen image engine.
  useEffect(() => {
    const saved = localStorage.getItem('infogenius_ai_config');
    if (saved) {
      try {
        setAiConfig({ model: DEFAULT_AI_MODEL, ...JSON.parse(saved) });
      } catch (e) {
        console.error('Failed to parse saved AI config', e);
      }
    }
    const savedEngine = localStorage.getItem('infogenius_image_engine') as ImageEngine | null;
    if (savedEngine === 'svg' || savedEngine === 'free-ai' || savedEngine === 'byok-ai') {
      setImageEngine(savedEngine);
    }
  }, []);

  const chooseEngine = (engine: ImageEngine) => {
    setImageEngine(engine);
    localStorage.setItem('infogenius_image_engine', engine);
  };

  const saveAiConfig = (config: AiImageConfig) => {
    setAiConfig(config);
    localStorage.setItem('infogenius_ai_config', JSON.stringify(config));
  };

  const hasKey = aiConfig.apiKey.trim().length > 0;

  // Render the always-available deterministic SVG infographic.
  const renderSvg = (svgTitle: string, facts: string[], sourceCount: number, variant = 0): string =>
    renderInfographic({
      title: svgTitle,
      facts,
      level: complexityLevel,
      style: visualStyle,
      colorScheme,
      backgroundColor,
      sourceCount,
      language,
      variant,
    });

  // Compose an image according to the selected engine.
  //  - The AI image engines always illustrate the user's own `topic` text (never a
  //    tangential article title), so the picture matches what they asked for.
  //  - `facts` are only the ON-TOPIC research facts (the caller passes [] when the
  //    Wikipedia match is weak), so a loosely-related article can't pollute the image.
  //  - Every path keeps the deterministic SVG as an on-error fallback.
  const composeImage = async (
    svgTitle: string,
    topic: string,
    facts: string[],
    sourceCount: number,
    seedText = topic
  ): Promise<GeneratedImage> => {
    const svg = renderSvg(svgTitle, facts, sourceCount);
    let data = svg;
    let fallback: string | undefined;

    if (imageEngine === 'free-ai') {
      // Keyless real AI image (Pollinations) shown via <img src>; SVG is the fallback.
      data = buildFreeImageUrl(
        topic, facts, complexityLevel, visualStyle, colorScheme, backgroundColor, language, seedFrom(seedText)
      );
      fallback = svg;
    } else if (imageEngine === 'byok-ai') {
      if (!hasKey) {
        setError('AI Image (your key) is selected but no Gemini key is set. Showing the SVG — open the ✨ menu to add a key, or switch to "AI Image · Free".');
      } else {
        try {
          const prompt = buildImagePrompt(
            topic, facts, complexityLevel, visualStyle, colorScheme, backgroundColor, language
          );
          data = await generateAiImage(aiConfig.apiKey, aiConfig.model, prompt);
        } catch (err: any) {
          console.error('AI image generation failed, using SVG fallback:', err);
          setError(`AI image failed (${err.message}). Showing the built-in SVG instead.`);
        }
      }
    }

    return {
      id: Date.now().toString(),
      data,
      fallback,
      prompt: topic,
      timestamp: Date.now(),
      level: complexityLevel,
      style: visualStyle,
      colorScheme,
      backgroundColor,
      language,
      facts,
      title: svgTitle,
    };
  };

  // Is the researched article actually about the user's topic? (Guards against the
  // fallback cascade surfacing a loosely-related article for a niche query.)
  const isOnTopic = (topic: string, title: string): boolean => {
    const toks = topic.toLowerCase().split(/\W+/).filter((w) => w.length >= 4);
    if (toks.length === 0) return true;
    const t = (title || '').toLowerCase();
    return toks.some((w) => t.includes(w));
  };

  const uploadToGitHub = async (
    fileData: string,
    filename: string,
    isText: boolean = false
  ) => {
    if (!ghConfig.token || !ghConfig.owner || !ghConfig.repo) return;

    // SVG images arrive as data URLs; CSV/text arrives raw. Both go up as base64.
    let content: string;
    if (isText) {
      content = toBase64Utf8(fileData);
    } else if (fileData.startsWith('data:image/svg+xml')) {
      content = toBase64Utf8(svgFromDataUrl(fileData));
    } else {
      content = fileData.split(',')[1];
    }

    const url = `https://api.github.com/repos/${ghConfig.owner}/${ghConfig.repo}/contents/${ghConfig.path}/${filename}`;

    try {
      let sha = null;
      const getRes = await fetch(url, {
        headers: { Authorization: `token ${ghConfig.token}` },
      });
      if (getRes.ok) {
        const data = await getRes.json();
        sha = data.sha;
      }

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `token ${ghConfig.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Sync file: ${filename}`,
          content,
          branch: ghConfig.branch,
          sha: sha || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'GitHub Upload Failed');
      }
      console.log(`Successfully synced ${filename} to GitHub`);
    } catch (err) {
      console.error('GitHub sync failed:', err);
      throw err;
    }
  };

  const exportAllToGitHub = async () => {
    if (!ghConfig.token || !ghConfig.owner || !ghConfig.repo) {
      alert('Please configure GitHub settings first.');
      return;
    }
    if (imageHistory.length === 0) {
      alert('No history to export.');
      return;
    }

    setIsSyncingAll(true);
    try {
      for (const img of imageHistory) {
        if (!img.data.startsWith('data:')) continue; // remote free-AI images can't be re-encoded
        const safeName = img.prompt.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
        await uploadToGitHub(img.data, `${safeName}_${img.id}.${extForData(img.data)}`);
      }

      const headers = ['ID', 'Topic', 'Timestamp', 'Complexity', 'Style', 'Color Scheme', 'Background', 'Language', 'Filename/URL'];
      const rows = imageHistory.map((img) => {
        const safeName = img.prompt.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
        const fileOrUrl = img.data.startsWith('data:')
          ? `${safeName}_${img.id}.${extForData(img.data)}`
          : `"${img.data.replace(/"/g, '""')}"`;
        return [
          img.id,
          `"${img.prompt.replace(/"/g, '""')}"`,
          new Date(img.timestamp).toISOString(),
          img.level || 'N/A',
          img.style || 'N/A',
          img.colorScheme || 'Default',
          img.backgroundColor || 'Default',
          img.language || 'N/A',
          fileOrUrl,
        ].join(',');
      });
      const csvContent = [headers.join(','), ...rows].join('\n');
      await uploadToGitHub(csvContent, 'metadata.csv', true);

      alert('Successfully exported all infographics and metadata.csv to GitHub!');
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = text.split(/\r?\n/).filter((row) => row.trim() !== '');
      if (rows.length === 0) return;

      let descriptions: string[] = [];
      const headerIndex = rows[0].toLowerCase().indexOf('figure description');

      if (headerIndex !== -1) {
        descriptions = rows.slice(1).map((row) => {
          const cols = row.split(',');
          return cols[0].replace(/^"|"$/g, '').trim();
        });
      } else {
        descriptions = rows.map((row) => row.split(',')[0].replace(/^"|"$/g, '').trim());
      }

      const items: BatchItem[] = descriptions
        .filter((d) => d.length > 0)
        .map((d) => ({
          id: Math.random().toString(36).substr(2, 9),
          description: d,
          status: 'pending',
        }));

      setBatchItems(items);
      setShowIntro(false);
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const runBatchLoop = async () => {
    if (isBatchProcessing || batchItems.length === 0) return;
    setIsBatchProcessing(true);
    stopBatchRef.current = false;

    const items = [...batchItems];
    for (let i = 0; i < items.length; i++) {
      if (stopBatchRef.current) {
        setIsBatchProcessing(false);
        return;
      }
      if (items[i].status === 'completed') continue;

      items[i].status = 'processing';
      setBatchItems([...items]);

      try {
        const research = await researchTopic(items[i].description, complexityLevel, language);
        const onTopic = research.searchResults.length > 0 && isOnTopic(items[i].description, research.title);
        const newImage = await composeImage(
          onTopic ? research.title : items[i].description,
          items[i].description,
          onTopic ? research.facts : [],
          research.searchResults.length
        );

        setImageHistory((prev) => [newImage, ...prev]);
        setCurrentSearchResults(research.searchResults);

        if (ghConfig.autoSync && newImage.data.startsWith('data:')) {
          const safeName = items[i].description.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
          await uploadToGitHub(newImage.data, `${safeName}_${newImage.id}.${extForData(newImage.data)}`);
        }

        items[i].status = 'completed';
      } catch (err: any) {
        console.error(`Batch failed for: ${items[i].description}`, err);
        items[i].status = 'failed';
        items[i].error = err.message || 'Unknown error';
      }
      setBatchItems([...items]);
      await new Promise((r) => setTimeout(r, 400));
    }
    setIsBatchProcessing(false);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!topic.trim()) {
      setError('Please enter a topic.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotice(null);
    setLoadingStep(1);
    setLoadingFacts([]);
    setCurrentSearchResults([]);
    setLoadingMessage(`Mining knowledge sources...`);

    try {
      const research = await researchTopic(topic, complexityLevel, language);
      const onTopic = research.searchResults.length > 0 && isOnTopic(topic, research.title);
      const factsForVisual = onTopic ? research.facts : [];
      const svgTitle = onTopic ? research.title : topic;

      setLoadingFacts(factsForVisual);
      setCurrentSearchResults(research.searchResults);
      if (!onTopic) {
        setNotice(
          research.searchResults.length === 0
            ? `No Wikipedia article matched “${topic}”. ${imageEngine === 'svg' ? 'Try broader or corrected keywords for cited facts.' : 'The image was generated directly from your text.'}`
            : `No close Wikipedia match for “${topic}”. ${imageEngine === 'svg' ? 'Showing your text.' : 'The image reflects your text;'} the listed sources are only loosely related.`
        );
      }

      setLoadingStep(2);
      setLoadingMessage(imageEngine === 'svg' ? `Composing infographic...` : `Generating AI image...`);

      const newImage = await composeImage(
        svgTitle,
        topic,
        factsForVisual,
        research.searchResults.length
      );

      setImageHistory([newImage, ...imageHistory]);

      if (ghConfig.autoSync && newImage.data.startsWith('data:')) {
        const safeName = topic.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
        await uploadToGitHub(newImage.data, `${safeName}_${newImage.id}.${extForData(newImage.data)}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Generation failed.');
    } finally {
      setIsLoading(false);
      setLoadingStep(0);
    }
  };

  // Edit / re-roll the current image, according to how it was produced:
  //  - free-ai URL  → regenerate with a new seed (a fresh image)
  //  - byok raster  → real AI edit with the user's key
  //  - SVG          → deterministic restyle (layout/accent variant)
  const handleEdit = async (editPrompt: string) => {
    if (imageHistory.length === 0) return;
    const current = imageHistory[0];
    const isSvg = current.data.startsWith('data:image/svg+xml');
    const isFreeAi = current.data.startsWith('http');
    setIsLoading(true);
    setError(null);
    setLoadingStep(2);

    try {
      let data = current.data;
      let fallback = current.fallback;
      if (isFreeAi && current.facts && current.title) {
        setLoadingMessage(`Regenerating image: "${editPrompt}"...`);
        data = buildFreeImageUrl(
          current.title, current.facts,
          current.level || complexityLevel, current.style || visualStyle,
          current.colorScheme || colorScheme, current.backgroundColor || backgroundColor,
          current.language || language, seedFrom(current.prompt + editPrompt)
        );
      } else if (!isSvg && hasKey) {
        setLoadingMessage(`AI editing: "${editPrompt}"...`);
        data = await editAiImage(aiConfig.apiKey, aiConfig.model, current.data, editPrompt);
      } else {
        if (!current.facts || !current.title) {
          setError('This item has no stored research to restyle.');
          setIsLoading(false);
          setLoadingStep(0);
          return;
        }
        setLoadingMessage(`Restyling: "${editPrompt}"...`);
        data = renderInfographic({
          title: current.title,
          facts: current.facts,
          level: current.level || complexityLevel,
          style: current.style || visualStyle,
          colorScheme: current.colorScheme || colorScheme,
          backgroundColor: current.backgroundColor || backgroundColor,
          sourceCount: currentSearchResults.length,
          language: current.language || language,
          variant: hashSeed(editPrompt),
        });
        fallback = undefined;
      }
      const newImage: GeneratedImage = {
        ...current,
        id: Date.now().toString(),
        data,
        fallback,
        prompt: `${current.prompt} · ${editPrompt}`,
        timestamp: Date.now(),
      };
      setImageHistory([newImage, ...imageHistory]);
      if (ghConfig.autoSync && data.startsWith('data:')) {
        await uploadToGitHub(data, `edited_${newImage.id}.${extForData(data)}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Edit failed.');
    } finally {
      setIsLoading(false);
      setLoadingStep(0);
    }
  };

  const restoreImage = (img: GeneratedImage) => {
    const newHistory = imageHistory.filter((i) => i.id !== img.id);
    setImageHistory([img, ...newHistory]);
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const data = JSON.parse(ev.target?.result as string);
            if (data.imageHistory) {
              setImageHistory(data.imageHistory);
              if (data.currentSearchResults) setCurrentSearchResults(data.currentSearchResults);
              setShowIntro(false);
            }
          };
          reader.readAsText(file);
        }}
        accept=".json"
        className="hidden"
      />

      <input type="file" ref={csvInputRef} onChange={handleCSVUpload} accept=".csv" className="hidden" />

      {showIntro ? (
        <IntroScreen onComplete={() => setShowIntro(false)} />
      ) : (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 pb-20 relative transition-colors">
          {/* AI Image (optional BYO-key) Modal */}
          {showAiSettings && (
            <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6 relative overflow-hidden">
                <button onClick={() => setShowAiSettings(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10">
                  <X className="w-5 h-5" />
                </button>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Wand2 className="w-6 h-6 text-fuchsia-500" />
                    <h2 className="text-xl font-bold">AI Image Generation</h2>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-500 border border-fuchsia-500/30">Optional</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                    You don't need this. The <span className="font-semibold">AI Image · Free</span> engine already generates real
                    images with no key or token. This panel is only for people who want to use their <span className="font-semibold">own
                    Google&nbsp;Gemini key</span> for higher-quality/edit-capable images. Your key is stored only in this browser and is
                    sent only to Google's API when you generate — never bundled, logged, or sent anywhere else.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Gemini API Key</label>
                      <input type="password" value={aiConfig.apiKey} onChange={(e) => saveAiConfig({ ...aiConfig, apiKey: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg p-2 mt-1 text-sm" placeholder="AIza..." />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Image Model</label>
                      <input type="text" value={aiConfig.model} onChange={(e) => saveAiConfig({ ...aiConfig, model: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg p-2 mt-1 text-sm font-mono" placeholder={DEFAULT_AI_MODEL} />
                      <p className="text-[10px] text-slate-500 mt-1">Any image-capable Gemini model your key can access.</p>
                    </div>
                    <button
                      onClick={() => { chooseEngine('byok-ai'); setShowAiSettings(false); }}
                      disabled={!hasKey}
                      className="w-full py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all"
                    >
                      Use my key (switch engine to “AI Image · Your Key”)
                    </button>
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-[11px] text-fuchsia-500 hover:opacity-80 flex items-center gap-1.5 font-semibold">
                      <ExternalLink className="w-3 h-3" /> Get a Gemini API key
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GitHub Settings Modal */}
          {showGhSettings && (
            <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6 relative overflow-hidden">
                <button onClick={() => setShowGhSettings(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10">
                  <X className="w-5 h-5" />
                </button>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <Github className="w-6 h-6 text-slate-900 dark:text-white" />
                    <h2 className="text-xl font-bold">GitHub Integration</h2>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Personal Access Token</label>
                      <input type="password" value={ghConfig.token} onChange={(e) => saveGhConfig({ ...ghConfig, token: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg p-2 mt-1 text-sm" placeholder="ghp_..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Owner</label>
                        <input type="text" value={ghConfig.owner} onChange={(e) => saveGhConfig({ ...ghConfig, owner: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg p-2 mt-1 text-sm" placeholder="username" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Repo</label>
                        <input type="text" value={ghConfig.repo} onChange={(e) => saveGhConfig({ ...ghConfig, repo: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg p-2 mt-1 text-sm" placeholder="my-repo" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Path</label>
                        <input type="text" value={ghConfig.path} onChange={(e) => saveGhConfig({ ...ghConfig, path: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg p-2 mt-1 text-sm" placeholder="images" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Branch</label>
                        <input type="text" value={ghConfig.branch} onChange={(e) => saveGhConfig({ ...ghConfig, branch: e.target.value })} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg p-2 mt-1 text-sm" placeholder="main" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-white/5">
                      <input type="checkbox" checked={ghConfig.autoSync} onChange={(e) => saveGhConfig({ ...ghConfig, autoSync: e.target.checked })} className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500" />
                      <span className="text-xs font-medium">Auto-sync generations to GitHub</span>
                    </div>

                    <div className="pt-4 border-t border-slate-200 dark:border-white/5 flex flex-col gap-2">
                      <button onClick={exportAllToGitHub} disabled={isSyncingAll || imageHistory.length === 0} className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/20">
                        {isSyncingAll ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span>Sync All History &amp; Metadata</span>
                      </button>
                      <p className="text-[10px] text-center text-slate-500 font-medium px-2">
                        This will upload all {imageHistory.length} SVG infographics and a <span className="text-cyan-500">metadata.csv</span> table to your repo.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navbar */}
          <header className="border-b border-slate-200 dark:border-white/10 sticky top-0 z-50 backdrop-blur-md bg-white/70 dark:bg-slate-950/60 transition-colors">
            <div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Atom className="w-6 h-6 text-cyan-600 dark:text-cyan-400 animate-[spin_10s_linear_infinite]" />
                <div className="flex flex-col">
                  <span className="font-display font-bold text-lg md:text-2xl tracking-tight text-slate-900 dark:text-white">InfoGenius Vision</span>
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Standalone Knowledge Engine</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setShowAiSettings(true)} className={`p-2 rounded-lg transition-colors border border-slate-200 dark:border-white/10 ${imageEngine === 'byok-ai' && hasKey ? 'text-fuchsia-600 dark:text-fuchsia-400' : 'text-slate-500'}`} title="AI Image key (optional, for 'AI Image · Your Key' engine)">
                  <Sparkles className="w-5 h-5" />
                </button>
                <button onClick={() => setShowGhSettings(true)} className={`p-2 rounded-lg transition-colors border border-slate-200 dark:border-white/10 ${ghConfig.token ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500'}`} title="GitHub Settings & Sync">
                  <Github className="w-5 h-5" />
                </button>
                <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10">
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </header>

          <main className="px-3 sm:px-6 py-4 md:py-8 relative z-10">
            {/* Batch Status UI */}
            {batchItems.length > 0 && (
              <div className="max-w-6xl mx-auto mb-8 animate-in slide-in-from-top-4 duration-500">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between border-b border-slate-200 dark:border-white/5">
                    <div className="flex items-center gap-3">
                      <Layers className="w-5 h-5 text-cyan-500" />
                      <h3 className="font-bold text-sm">Batch Processing Queue ({batchItems.filter((i) => i.status === 'completed').length}/{batchItems.length})</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {isBatchProcessing ? (
                        <button onClick={() => (stopBatchRef.current = true)} className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-500 flex items-center gap-2">
                          <Square className="w-3.5 h-3.5 fill-current" /> Stop Loop
                        </button>
                      ) : (
                        <button onClick={runBatchLoop} className="px-4 py-1.5 bg-cyan-600 text-white text-xs font-bold rounded-lg hover:bg-cyan-500 flex items-center gap-2">
                          <Play className="w-3.5 h-3.5" /> Start Loop
                        </button>
                      )}
                      <button onClick={() => setBatchItems([])} className="p-1.5 text-slate-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {batchItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5">
                        <span className="text-xs truncate max-w-[150px] font-medium opacity-80">{item.description}</span>
                        <div className="flex items-center gap-2">
                          {item.status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin" />}
                          {item.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                          {item.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                          {item.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-slate-700"></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className={`max-w-6xl mx-auto transition-all duration-500 ${imageHistory.length > 0 ? 'mb-8' : 'min-h-[50vh] flex flex-col justify-center'}`}>
              {!imageHistory.length && (
                <div className="text-center mb-12 space-y-4">
                  <h1 className="text-4xl md:text-7xl font-display font-bold text-slate-900 dark:text-white leading-tight">
                    Visualize <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-500">Knowledge.</span>
                  </h1>
                  <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                    Research any topic and compose a cited infographic — entirely in your browser. No API key, no server.
                  </p>
                </div>
              )}

              <form onSubmit={handleGenerate} className={`relative z-20 ${isLoading ? 'opacity-50' : ''}`}>
                <div className="relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-2 rounded-3xl shadow-2xl">
                  <div className="relative flex items-center">
                    <Search className="absolute left-6 w-6 h-6 text-slate-400" />
                    <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What do you want to visualize?" className="w-full pl-16 pr-6 py-6 bg-transparent border-none outline-none text-xl md:text-2xl placeholder:text-slate-400 font-medium text-slate-900 dark:text-white" />
                  </div>

                  <div className="flex flex-col md:flex-row flex-wrap gap-2 p-2 mt-2">
                    <div className="flex-1 min-w-[170px] bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-fuchsia-300/40 dark:border-fuchsia-500/20 px-4 py-3 flex items-center gap-3">
                      <Wand2 className="w-4 h-4 text-fuchsia-500" />
                      <select value={imageEngine} onChange={(e) => chooseEngine(e.target.value as ImageEngine)} className="bg-transparent border-none text-sm font-bold w-full focus:ring-0" title="How the visual is produced">
                        <option value="free-ai">AI Image · Free (no key)</option>
                        <option value="svg">Infographic · SVG (offline)</option>
                        <option value="byok-ai">AI Image · Your Key</option>
                      </select>
                    </div>

                    <div className="flex-1 min-w-[150px] bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-white/5 px-4 py-3 flex items-center gap-3">
                      <GraduationCap className="w-4 h-4 text-cyan-600" />
                      <select value={complexityLevel} onChange={(e) => setComplexityLevel(e.target.value as ComplexityLevel)} className="bg-transparent border-none text-sm font-bold w-full focus:ring-0">
                        <option value="Elementary">Elementary</option>
                        <option value="High School">High School</option>
                        <option value="College">College</option>
                        <option value="Expert">Expert</option>
                      </select>
                    </div>

                    <div className="flex-1 min-w-[150px] bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-white/5 px-4 py-3 flex items-center gap-3">
                      <Palette className="w-4 h-4 text-purple-600" />
                      <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value as VisualStyle)} className="bg-transparent border-none text-sm font-bold w-full focus:ring-0">
                        <option value="Default">Standard Scientific</option>
                        <option value="Minimalist">Minimalist</option>
                        <option value="Realistic">Photorealistic</option>
                        <option value="Vintage">Vintage Lithograph</option>
                        <option value="Futuristic">Cyberpunk HUD</option>
                        <option value="3D Render">3D Render</option>
                        <option value="Sketch">Sketch</option>
                      </select>
                    </div>

                    <div className="flex-1 min-w-[150px] bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-white/5 px-4 py-3 flex items-center gap-3">
                      <Pipette className="w-4 h-4 text-pink-600" />
                      <select value={colorScheme} onChange={(e) => setColorScheme(e.target.value as ColorScheme)} className="bg-transparent border-none text-sm font-bold w-full focus:ring-0">
                        <option value="Default">Natural Colors</option>
                        <option value="Black & White">High Contrast (B&W)</option>
                        <option value="Vibrant (Red/Blue/Green/Yellow)">Vibrant Colors</option>
                        <option value="Pastel Soft">Pastel Soft</option>
                        <option value="Professional Earth Tones">Earth Tones</option>
                        <option value="Dark UI (Neon & Gradients)">Neon Dark Mode</option>
                      </select>
                    </div>

                    <div className="flex-1 min-w-[150px] bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-white/5 px-4 py-3 flex items-center gap-3">
                      <Paintbrush className="w-4 h-4 text-amber-600" />
                      <select value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value as BackgroundColor)} className="bg-transparent border-none text-sm font-bold w-full focus:ring-0">
                        <option value="Default">Auto Background</option>
                        <option value="Pure White">Pure White</option>
                        <option value="Solid Black">Solid Black</option>
                        <option value="Deep Navy">Deep Navy</option>
                        <option value="Neutral Gray">Neutral Gray</option>
                        <option value="Parchment/Cream">Parchment/Cream</option>
                        <option value="Translucent Glass">Translucent Glass</option>
                      </select>
                    </div>

                    <div className="flex-1 min-w-[150px] bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-white/5 px-4 py-3 flex items-center gap-3">
                      <Microscope className="w-4 h-4 text-emerald-600" />
                      <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="bg-transparent border-none text-sm font-bold w-full focus:ring-0">
                        <option value="English">English</option>
                        <option value="Spanish">Spanish</option>
                        <option value="French">French</option>
                        <option value="German">German</option>
                        <option value="Mandarin">Mandarin</option>
                        <option value="Japanese">Japanese</option>
                        <option value="Hindi">Hindi</option>
                        <option value="Arabic">Arabic</option>
                        <option value="Portuguese">Portuguese</option>
                        <option value="Russian">Russian</option>
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <button type="button" onClick={() => csvInputRef.current?.click()} className="px-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-colors">
                        <FileText className="w-4 h-4" /> CSV
                      </button>
                      <button type="submit" disabled={isLoading} className="bg-cyan-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-cyan-500 transition-all flex items-center gap-2">
                        <Microscope className="w-5 h-5" /> <span>GENERATE</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {isLoading && <Loading status={loadingMessage} step={loadingStep} facts={loadingFacts} />}

            {error && (
              <div className="max-w-2xl mx-auto mt-8 p-6 bg-red-100 dark:bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-4 text-red-800 dark:text-red-200">
                <AlertCircle className="w-6 h-6 flex-shrink-0" />
                <p className="font-medium">{error}</p>
              </div>
            )}

            {notice && !error && !isLoading && (
              <div className="max-w-2xl mx-auto mt-8 p-4 bg-amber-100 dark:bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-amber-800 dark:text-amber-200">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{notice}</p>
              </div>
            )}

            {imageHistory.length > 0 && !isLoading && (
              <>
                <Infographic image={imageHistory[0]} onEdit={handleEdit} isEditing={isLoading} />
                <SearchResults results={currentSearchResults} />
              </>
            )}

            {imageHistory.length > 1 && (
              <div className="max-w-7xl mx-auto mt-24 border-t border-slate-200 dark:border-white/10 pt-12">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-3">
                    <History className="w-4 h-4" /> Recent Generations
                  </h3>
                  {imageHistory.length > 0 && ghConfig.token && (
                    <button onClick={() => setShowGhSettings(true)} className="text-[10px] uppercase font-bold text-cyan-600 flex items-center gap-2 hover:opacity-80">
                      <Github className="w-3 h-3" /> Sync to Repository
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                  {imageHistory.slice(1).map((img) => (
                    <div key={img.id} onClick={() => restoreImage(img)} className="group relative cursor-pointer rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 hover:border-cyan-500 transition-all">
                      <img src={img.data} alt={img.prompt} className="w-full aspect-video object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-white text-xs font-bold px-3 text-center line-clamp-2">{img.prompt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export default App;
