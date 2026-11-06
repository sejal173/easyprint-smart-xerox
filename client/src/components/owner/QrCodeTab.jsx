import React, { useState, useEffect } from 'react';
import { QrCode, Download, Printer, Copy, Check, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchOwnerQr } from '../../services/api';

export default function QrCodeTab({ shop }) {
  const [qrData, setQrData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (shop?._id) {
      fetchOwnerQr(shop._id).then((res) => {
        if (res.success) {
          setQrData(res);
        }
      });
    }
  }, [shop]);

  const publicUrl = qrData?.publicUrl || `${window.location.origin}/s/${shop?.slug}`;
  const dataUrl = qrData?.pngDataUrl;

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.success('Shop link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!dataUrl) {
      window.open(`/api/owner/shops/${shop._id}/qr/download`, '_blank');
      return;
    }
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `easyprint-qr-${shop.slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('QR Code downloaded!');
  };

  const handlePrintStandee = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-brand-600" />
            <span>Shop QR Code & Counter Standee</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Display this QR code at your xerox counter for instant customer scan-to-print
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>Copy Link</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <Download className="w-4 h-4" />
            <span>Download PNG</span>
          </button>

          <button
            onClick={handlePrintStandee}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-md shadow-brand-500/20 transition active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Counter Standee</span>
          </button>
        </div>
      </div>

      {/* Print-Ready Counter Standee Card */}
      <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border-2 border-slate-300 shadow-xl text-center space-y-6 print:border-none print:shadow-none print:p-0">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-extrabold uppercase tracking-widest border border-brand-200">
            ⚡ EasyPrint Smart Xerox Station
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-2">
            {shop?.name}
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {shop?.address} • Phone: {shop?.phone}
          </p>
        </div>

        {/* Large QR Display */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 inline-block shadow-inner">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="Shop QR Code"
              className="w-64 h-64 mx-auto rounded-xl bg-white p-2 shadow-sm"
            />
          ) : (
            <div className="w-64 h-64 flex items-center justify-center text-xs text-slate-400">
              Loading QR Code...
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-base font-extrabold text-brand-700 tracking-tight">
            📲 Scan to Upload & Print Instantly
          </div>
          <p className="text-xs text-slate-500">
            No WhatsApp sharing needed • Instant B&W / Color • Live Queue Tracking
          </p>
          <div className="text-[11px] font-mono text-slate-400 pt-1">
            {publicUrl}
          </div>
        </div>
      </div>
    </div>
  );
}

