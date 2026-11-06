import React from 'react';
import { Link } from 'react-router-dom';
import { Printer, QrCode, ArrowRight, Zap, CheckCircle2, Shield, Clock } from 'lucide-react';
import Navbar from '../components/Navbar';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-12 space-y-10">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold">
            <Zap className="w-3.5 h-3.5 fill-brand-500" />
            <span>Zero-Wait Smart Xerox Automation</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Print Smarter, Faster, <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-sky-500">
              Direct from Your Phone
            </span>
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            Scan your xerox shop’s QR code, upload your documents, customize your print options with live price quotes, and skip the counter lines.
          </p>
        </div>

        {/* Demo Shop Access Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md shadow-slate-200/50 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">
                Phase 1 Active Demo Shop
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                QuickCopy Smart Xerox & Digital Prints
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Campus Commercial Complex, Opp. Main Gate, University Road
              </p>
            </div>

            <Link
              to="/s/quickcopy-central"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-lg shadow-brand-500/25 active:scale-95 transition"
            >
              <span>Open Customer App</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Quick Specs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] text-slate-400 font-medium">B&W Rate</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">₹2.00 / page</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] text-slate-400 font-medium">Color Rate</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">₹10.00 / page</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] text-slate-400 font-medium">Duplex Savings</div>
              <div className="text-sm font-bold text-emerald-600 mt-0.5">- ₹0.50 / sheet</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] text-slate-400 font-medium">Paper Sizes</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">A4 & A3</div>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
              <QrCode className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">QR Code Station Access</h3>
            <p className="text-xs text-slate-500">
              Every shop has a unique QR code allowing customers to immediately open the ordering portal on any phone.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">True Byte Validation</h3>
            <p className="text-xs text-slate-500">
              Inspects magic bytes for PDFs and images with automatic server-side page counting.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">Live Server Pricing</h3>
            <p className="text-xs text-slate-500">
              Every option—copies, duplex, page range, glossy paper—is computed reliably by the server.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

