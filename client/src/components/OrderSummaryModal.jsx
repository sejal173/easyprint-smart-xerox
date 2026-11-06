import React from 'react';
import { CheckCircle2, Copy, FileText, ArrowRight, Printer, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OrderSummaryModal({ isOpen, onClose, order, onReset }) {
  if (!isOpen || !order) return null;

  const handleCopyOrderNumber = () => {
    navigator.clipboard.writeText(order.orderNumber);
    toast.success('Order number copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header Icon */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">Draft Order Created!</h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Your print order has been validated and recorded in the database.
          </p>
        </div>

        {/* Order Number Banner */}
        <div className="p-4 rounded-2xl bg-brand-50 border border-brand-200 text-center space-y-1">
          <span className="text-[11px] font-bold text-brand-700 uppercase tracking-widest">
            Unique Order Number
          </span>
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-black font-mono text-brand-900 tracking-wider">
              {order.orderNumber}
            </span>
            <button
              onClick={handleCopyOrderNumber}
              className="p-1.5 text-brand-600 hover:text-brand-800 hover:bg-brand-100 rounded-lg transition"
              title="Copy Order Number"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[11px] font-semibold text-brand-600">
            Status: <span className="uppercase font-bold">{order.status}</span>
          </div>
        </div>

        {/* Details Table */}
        <div className="mt-5 space-y-2.5 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200/70">
            <span className="text-slate-500">Shop</span>
            <span className="font-bold text-slate-800">{order.shop?.name}</span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-slate-200/70">
            <span className="text-slate-500">Print Options</span>
            <span className="font-semibold text-slate-800">
              {order.options?.colorMode === 'color' ? 'Colour' : 'B&W'} •{' '}
              {order.options?.sides === 'double' ? 'Both Sides' : 'Single Side'} •{' '}
              {order.options?.paperSize}
            </span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-slate-200/70">
            <span className="text-slate-500">Copies & Physical Sheets</span>
            <span className="font-bold text-slate-800">
              {order.options?.copies} copies ({order.breakdown?.totalSheets} sheets total)
            </span>
          </div>

          <div className="flex justify-between items-center pt-1">
            <span className="font-bold text-slate-900 text-sm">Total Price</span>
            <span className="text-lg font-black text-brand-700">₹{order.totalAmount?.toFixed(2)}</span>
          </div>
        </div>

        {/* Phase Roadmap Callout */}
        <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Phase 1 Complete: </span>
            This draft order is safely stored in MongoDB. In Phase 2, owner live queue will be introduced, followed by Razorpay payments and the Windows printing agent in Phase 3.
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6">
          <button
            onClick={() => {
              onClose();
              if (onReset) onReset();
            }}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider transition active:scale-95"
          >
            Create Another Print Job
          </button>
        </div>
      </div>
    </div>
  );
}

