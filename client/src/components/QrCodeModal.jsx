import React, { useState } from 'react';
import { X, Download, Copy, Check, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';

export default function QrCodeModal({ isOpen, onClose, shop }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !shop) return null;

  const publicUrl = shop.qrCode?.publicUrl || `${window.location.origin}/s/${shop.slug}`;
  const dataUrl = shop.qrCode?.dataUrl;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.success('Shop link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!dataUrl) {
      window.open(`/api/shops/${shop.slug}/qrcode`, '_blank');
      return;
    }
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `easyprint-${shop.slug}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('QR Code downloaded!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1.5 mb-5">
          <div className="inline-flex p-2.5 rounded-2xl bg-brand-50 text-brand-600 mb-1">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{shop.name}</h3>
          <p className="text-xs text-slate-500">Scan to open print ordering page instantly</p>
        </div>

        {/* QR Code Graphic */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 flex flex-col items-center justify-center shadow-inner">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="Shop QR Code"
              className="w-56 h-56 rounded-xl bg-white p-2 shadow-sm"
            />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-xs text-slate-400">
              Generating QR Code...
            </div>
          )}
          <div className="mt-3 text-[11px] font-mono text-slate-500 truncate max-w-[240px]">
            {publicUrl}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition active:scale-95"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied' : 'Copy Link'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition active:scale-95 shadow-md shadow-brand-500/20"
          >
            <Download className="w-4 h-4" />
            <span>Download PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
}

