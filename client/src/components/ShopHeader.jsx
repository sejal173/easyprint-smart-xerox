import React from 'react';
import { MapPin, Phone, Clock, QrCode, ShieldCheck, Users, AlertCircle } from 'lucide-react';

export default function ShopHeader({ shop, onOpenQr }) {
  if (!shop) return null;

  const isOffline = shop.availability === 'OFFLINE';
  const isBusy = shop.availability === 'BUSY';

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {shop.name}
            </h1>
            {shop.isApproved && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                Verified Shop
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {shop.address}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {shop.phone}
            </span>
          </div>
        </div>

        {/* QR Code Action Button */}
        <button
          onClick={onOpenQr}
          className="self-start inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 transition rounded-xl border border-slate-200"
          title="View or Download Shop QR Code"
        >
          <QrCode className="w-4 h-4 text-brand-600" />
          <span>Shop QR Code</span>
        </button>
      </div>

      {/* Live Status Banner */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100">
        {/* Availability Badge */}
        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <div
            className={`w-3 h-3 rounded-full shrink-0 ${
              isOffline
                ? 'bg-rose-500 animate-pulse'
                : isBusy
                ? 'bg-amber-500'
                : 'bg-emerald-500 ring-4 ring-emerald-100'
            }`}
          />
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Shop Status
            </div>
            <div
              className={`text-sm font-bold ${
                isOffline
                  ? 'text-rose-600'
                  : isBusy
                  ? 'text-amber-600'
                  : 'text-emerald-700'
              }`}
            >
              {isOffline ? 'OFFLINE' : isBusy ? 'BUSY QUEUE' : 'ONLINE & READY'}
            </div>
          </div>
        </div>

        {/* Current Queue */}
        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <Users className="w-5 h-5 text-slate-500" />
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Current Queue
            </div>
            <div className="text-sm font-bold text-slate-900">
              {shop.queueLength === 0 ? 'No orders ahead' : `${shop.queueLength} orders ahead`}
            </div>
          </div>
        </div>

        {/* Estimated Wait Time */}
        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <Clock className="w-5 h-5 text-slate-500" />
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Est. Waiting Time
            </div>
            <div className="text-sm font-bold text-slate-900">
              {shop.estimatedWaitTime || 'Instant'}
            </div>
          </div>
        </div>
      </div>

      {/* Offline Alert Warning */}
      {isOffline && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-rose-900">Shop Currently Offline</h3>
            <p className="text-xs text-rose-700 mt-0.5">
              This shop is currently not accepting new print jobs. Please check back later or visit when the shop reopens.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

