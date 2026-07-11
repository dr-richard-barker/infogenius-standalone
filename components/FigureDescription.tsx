/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FigureDescription — the "hybrid" text panel. AI illustrations are generated
 * text-free (so nothing gets garbled); the full figure legend — title, key facts
 * and sources — lives here as ready-to-copy text the user can paste into their own
 * figure caption later.
 */
import React, { useState } from 'react';
import { GeneratedImage } from '../types';
import { FileText, Copy, Check } from 'lucide-react';

interface Props {
  image: GeneratedImage;
}

const FigureDescription: React.FC<Props> = ({ image }) => {
  const [copied, setCopied] = useState(false);
  const text = image.description || '';
  if (!text.trim()) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without clipboard permission.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="w-full max-w-6xl mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between gap-3 mb-4 border-t border-slate-200 dark:border-white/10 pt-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-white/10 text-fuchsia-600 dark:text-fuchsia-400 shadow-sm">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-[0.15em]">Figure Description</h3>
            <span className="text-[11px] text-slate-400">
              {image.textFree ? 'Not baked into the image — copy it into your own caption.' : 'Copyable legend for this figure.'}
            </span>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className={`shrink-0 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all border ${
            copied
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30'
              : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white border-transparent shadow-lg shadow-fuchsia-500/20'
          }`}
        >
          {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy text</>}
        </button>
      </div>

      <textarea
        readOnly
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full h-64 resize-y bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap focus:ring-2 focus:ring-fuchsia-500/40 focus:outline-none"
      />
    </div>
  );
};

export default FigureDescription;
