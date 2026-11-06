import React from 'react';
import { IndianRupee, Loader2, CheckCircle, ShieldAlert, ArrowRight } from 'lucide-react';

export default function PriceBreakdown({
  quote,
  isLoading,
  customerPhone,
  onPhoneChange,
  onCreateDraft,
  isCreatingDraft,
  disabled = false,
  hasFiles = false,
}) {
  const breakdown = quote?.breakdown || {};
  const totalAmount = quote?.totalAmount || 0;

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <IndianRupee className="w-4 h-4 text-brand-600" />
          <span>Transparent Price Breakdown</span>
        </h3>
        {isLoading ? (
          <span className="flex items-center gap-1.5 text-xs text-brand-600 font-semibold">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Recalculating...
          </span>
        ) : (
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Official Server Quote
          </span>
        )}
      </div>

      {hasFiles ? (
        <div className="space-y-3">
          {/* Summary items */}
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Selected Document Pages</span>
              <span className="font-bold text-slate-800">{breakdown.effectivePages || 0} pages</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Physical Sheets (per copy)</span>
              <span className="font-bold text-slate-800">{breakdown.sheetsPerCopy || 0} sheets</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Color Mode & Base Rate</span>
              <span className="font-bold text-slate-800">
                {breakdown.colorMode === 'color' ? 'Colour' : 'B&W'} (₹{breakdown.baseRate?.toFixed(2)}/page)
              </span>
            </div>

            {breakdown.paperSize === 'A3' && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 text-brand-700">
                <span>A3 Size Multiplier</span>
                <span className="font-bold">{breakdown.paperSizeMultiplier}x rate</span>
              </div>
            )}

            {breakdown.duplexDiscountTotal > 0 && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 text-emerald-600">
                <span className="font-medium">Both Sides (Duplex) Savings</span>
                <span className="font-bold">- ₹{breakdown.duplexDiscountTotal?.toFixed(2)}</span>
              </div>
            )}

            {breakdown.paperQualitySurchargeTotal > 0 && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 text-amber-700">
                <span className="font-medium">Glossy Paper Surcharge</span>
                <span className="font-bold">+ ₹{breakdown.paperQualitySurchargeTotal?.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Total Copies</span>
              <span className="font-bold text-slate-800">× {breakdown.copies || 1}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-500">Total Physical Sheets to Print</span>
              <span className="font-bold text-slate-800">{breakdown.totalSheets || 0} sheets</span>
            </div>
          </div>

          {/* Prominent Total Price Card */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-brand-50 to-sky-50 border border-brand-100 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-brand-900 uppercase tracking-wider">
                Total Estimated Amount
              </span>
              <p className="text-[11px] text-brand-700 font-medium">All taxes & xerox fees included</p>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-brand-700 tracking-tight">
              ₹{totalAmount.toFixed(2)}
            </div>
          </div>

          {/* Customer Phone (Optional) */}
          <div className="pt-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Customer Mobile Number (Optional for SMS / pickup alerts)
            </label>
            <input
              type="tel"
              disabled={disabled || isCreatingDraft}
              value={customerPhone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition"
            />
          </div>

          {/* Create Draft Order Button */}
          <button
            type="button"
            disabled={disabled || isCreatingDraft || totalAmount <= 0}
            onClick={onCreateDraft}
            className="w-full py-3.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-brand-500/25 active:scale-[0.99] transition duration-150"
          >
            {isCreatingDraft ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Draft Order...</span>
              </>
            ) : (
              <>
                <span>Review & Create Draft Order</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-center text-[11px] text-slate-400">
            Phase 1: Generates verified Order Number. Payment integration unlocks in Phase 3.
          </p>
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-slate-400">
          Upload at least one document above to view live pricing calculation.
        </div>
      )}
    </div>
  );
}

