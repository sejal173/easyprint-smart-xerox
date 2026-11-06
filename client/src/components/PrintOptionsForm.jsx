import React from 'react';
import {
  Sliders,
  Copy,
  Layers,
  Palette,
  FileCheck,
  Sparkles,
  Maximize2,
  RotateCw,
  Hash,
} from 'lucide-react';

export default function PrintOptionsForm({ options, onChange, priceSettings = {}, disabled = false }) {
  const updateOption = (key, value) => {
    if (disabled) return;
    onChange({ ...options, [key]: value });
  };

  const handleCopiesChange = (delta) => {
    const next = Math.max(1, (options.copies || 1) + delta);
    updateOption('copies', next);
  };

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-brand-600" />
          <span>Print Settings & Customization</span>
        </h2>
        <span className="text-xs text-brand-700 font-semibold bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
          Instant Auto-Quote
        </span>
      </div>

      {/* Grid of print options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* 1. Number of Copies */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            Number of Copies
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={disabled || options.copies <= 1}
              onClick={() => handleCopiesChange(-1)}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-lg flex items-center justify-center transition active:scale-95 border border-slate-200"
            >
              -
            </button>
            <div className="flex-1 text-center font-extrabold text-xl text-slate-900 bg-slate-50 py-2 rounded-xl border border-slate-200">
              {options.copies || 1}
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleCopiesChange(1)}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-lg flex items-center justify-center transition active:scale-95 border border-slate-200"
            >
              +
            </button>
          </div>
        </div>

        {/* 2. Color Mode (B&W / Colour) */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-slate-400" />
            Print Color Mode
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('colorMode', 'bw')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                options.colorMode === 'bw'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-slate-900" />
              <span>B&W (₹{priceSettings.bwPerPage?.toFixed(2) || '2.00'})</span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('colorMode', 'color')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                options.colorMode === 'color'
                  ? 'bg-white text-brand-700 shadow-sm border border-brand-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-red-500 via-green-500 to-blue-500" />
              <span>Colour (₹{priceSettings.colorPerPage?.toFixed(2) || '10.00'})</span>
            </button>
          </div>
        </div>

        {/* 3. Sides (One side / Both sides) */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            Sides (Duplex Mode)
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('sides', 'single')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition ${
                options.sides === 'single'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              One Side (Single)
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('sides', 'double')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition relative ${
                options.sides === 'double'
                  ? 'bg-white text-brand-700 shadow-sm border border-brand-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Both Sides (Duplex)
              {priceSettings.duplexDiscount > 0 && (
                <span className="ml-1 text-[10px] text-emerald-600 font-extrabold">Save ₹{priceSettings.duplexDiscount}</span>
              )}
            </button>
          </div>
        </div>

        {/* 4. Paper Size (A4 / A3) */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            Paper Size
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('paperSize', 'A4')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition ${
                options.paperSize === 'A4'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Standard A4
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('paperSize', 'A3')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition ${
                options.paperSize === 'A3'
                  ? 'bg-white text-brand-700 shadow-sm border border-brand-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Large A3 ({priceSettings.a3Multiplier || 2}x Rate)
            </button>
          </div>
        </div>

        {/* 5. Paper Quality (Normal / Glossy) */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
            Paper Quality
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('paperQuality', 'normal')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition ${
                options.paperQuality === 'normal'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Normal (75 GSM)
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('paperQuality', 'glossy')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition ${
                options.paperQuality === 'glossy'
                  ? 'bg-white text-brand-700 shadow-sm border border-brand-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Glossy (+₹{priceSettings.glossyPaperSurcharge || 5}/sheet)
            </button>
          </div>
        </div>

        {/* 6. Orientation (Portrait / Landscape) */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <RotateCw className="w-3.5 h-3.5 text-slate-400" />
            Orientation
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('orientation', 'portrait')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition ${
                options.orientation === 'portrait'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Portrait ▯
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => updateOption('orientation', 'landscape')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition ${
                options.orientation === 'landscape'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Landscape ▭
            </button>
          </div>
        </div>

        {/* 7. Pages Per Sheet (1, 2, 4) */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            Pages Per Sheet
          </label>
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            {[1, 2, 4].map((n) => (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => updateOption('pagesPerSheet', n)}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition ${
                  Number(options.pagesPerSheet) === n
                    ? 'bg-white text-brand-700 shadow-sm border border-brand-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {n} {n === 1 ? 'Page' : 'Pages'}
              </button>
            ))}
          </div>
        </div>

        {/* 8. Odd / Even Pages */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-slate-400" />
            Odd / Even Pages
          </label>
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            {[
              { id: 'all', label: 'All Pages' },
              { id: 'odd', label: 'Odd Only' },
              { id: 'even', label: 'Even Only' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => updateOption('oddEven', item.id)}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition ${
                  options.oddEven === item.id
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 9. Page Selection (All / Custom Page Range) */}
      <div className="pt-2 border-t border-slate-100 space-y-3">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <FileCheck className="w-3.5 h-3.5 text-slate-400" />
          Page Range Selection
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateOption('pageSelection', 'all')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              options.pageSelection === 'all'
                ? 'bg-brand-50 text-brand-800 border-2 border-brand-500'
                : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>All Pages</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateOption('pageSelection', 'custom')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              options.pageSelection === 'custom'
                ? 'bg-brand-50 text-brand-800 border-2 border-brand-500'
                : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>Custom Range</span>
          </button>
        </div>

        {options.pageSelection === 'custom' && (
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="text-xs font-semibold text-slate-700">
              Enter page range (e.g. <code className="text-brand-600 bg-brand-50 px-1 py-0.5 rounded">1-3, 5, 7-9</code>):
            </label>
            <input
              type="text"
              disabled={disabled}
              value={options.customRange || ''}
              onChange={(e) => updateOption('customRange', e.target.value)}
              placeholder="e.g. 1-3, 5, 7-9"
              className="w-full px-3.5 py-2 text-sm bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
            />
            <p className="text-[11px] text-slate-500">
              Supports comma-separated individual pages and hyphen-separated page spans.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

