import React, { useState } from 'react';
import { Printer, Plus, Trash2, CheckCircle2, ShieldCheck, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { addPrinter, deletePrinter, updatePrinter } from '../../services/api';

export default function PrintersTab({ shopId, printers = [], onRefresh }) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [colorSupport, setColorSupport] = useState(false);
  const [duplexSupport, setDuplexSupport] = useState(true);
  const [paperSizes, setPaperSizes] = useState(['A4']);
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleTogglePaperSize = (size) => {
    setPaperSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const handleAddPrinter = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Printer name is required');
      return;
    }
    if (paperSizes.length === 0) {
      toast.error('Select at least one supported paper size');
      return;
    }

    setIsSaving(true);
    try {
      await addPrinter(shopId, {
        name: name.trim(),
        colorSupport,
        duplexSupport,
        paperSizes,
        isDefault,
      });
      toast.success('Printer added successfully!');
      setIsAddModalOpen(false);
      setName('');
      setColorSupport(false);
      setDuplexSupport(true);
      setPaperSizes(['A4']);
      setIsDefault(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add printer';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (printerId) => {
    if (!window.confirm('Are you sure you want to remove this printer?')) return;
    try {
      await deletePrinter(shopId, printerId);
      toast.success('Printer removed');
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error('Failed to remove printer');
    }
  };

  const handleSetDefault = async (printer) => {
    if (printer.isDefault) return;
    try {
      await updatePrinter(shopId, printer._id, { isDefault: true });
      toast.success(`${printer.name} set as default printer`);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error('Failed to set default printer');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Printer className="w-5 h-5 text-brand-600" />
            <span>Configured Hardware Printers</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered physical printers available for automated printing
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition active:scale-95 shadow-md shadow-brand-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Add Printer</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {printers.map((p) => (
          <div
            key={p._id}
            className={`bg-white p-5 rounded-2xl border transition ${
              p.isDefault ? 'border-brand-300 ring-2 ring-brand-100' : 'border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{p.name}</h3>
                  {p.isDefault && (
                    <span className="text-[10px] font-bold uppercase bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
                  <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">
                    {p.colorSupport ? '🎨 Colour + B&W' : '⚫ B&W Only'}
                  </span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">
                    {p.duplexSupport ? '🔄 Duplex Supported' : 'Single-side Only'}
                  </span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">
                    📄 {p.paperSizes?.join(', ') || 'A4'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleDelete(p._id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                title="Remove printer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Status: Spooler Connected</span>
              {!p.isDefault && (
                <button
                  onClick={() => handleSetDefault(p)}
                  className="text-xs font-bold text-brand-600 hover:text-brand-800"
                >
                  Set as Default
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Printer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4">Add Physical Printer</h3>

            <form onSubmit={handleAddPrinter} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase">Printer Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. HP LaserJet Pro M404dn"
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={colorSupport}
                    onChange={(e) => setColorSupport(e.target.checked)}
                    className="rounded text-brand-600"
                  />
                  <span className="font-semibold text-slate-700">Colour Support</span>
                </label>

                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={duplexSupport}
                    onChange={(e) => setDuplexSupport(e.target.checked)}
                    className="rounded text-brand-600"
                  />
                  <span className="font-semibold text-slate-700">Duplex Support</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase">Supported Paper Sizes</label>
                <div className="flex gap-3">
                  {['A4', 'A3'].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handleTogglePaperSize(size)}
                      className={`px-4 py-2 rounded-xl font-bold transition ${
                        paperSizes.includes(size)
                          ? 'bg-brand-50 text-brand-700 border-2 border-brand-500'
                          : 'bg-slate-50 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded text-brand-600"
                />
                <span className="font-semibold text-slate-700">Make this the default printer</span>
              </label>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Printer'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

