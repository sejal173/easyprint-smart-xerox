import React from 'react';
import { Printer, LogOut, Power } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function OwnerNavbar({ shop, onToggleOnline, isTogglingOnline }) {
  const { user, logout } = useAuth();
  const isOnline = shop?.isOnline;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
                {shop?.name || 'Owner Dashboard'}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                Phase 2
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate max-w-[200px] sm:max-w-xs">
              {shop?.address}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Online / Offline Toggle */}
          {shop && (
            <button
              onClick={onToggleOnline}
              disabled={isTogglingOnline}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 border ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
              }`}
              title="Click to toggle shop online/offline"
            >
              <Power className={`w-3.5 h-3.5 ${isOnline ? 'text-emerald-600' : 'text-rose-600'}`} />
              <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </button>
          )}

          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

          {/* Owner user profile & logout */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 hidden sm:inline">
              {user?.name}
            </span>
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

