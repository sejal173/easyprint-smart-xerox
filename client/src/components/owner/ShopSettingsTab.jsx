import React, { useState } from 'react';
import { Sliders, Save, Loader2, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import { updateOwnerShop } from '../../services/api';

export default function ShopSettingsTab({ shop, onRefresh }) {
  const [name, setName] = useState(shop?.name || '');
  const [address, setAddress] = useState(shop?.address || '');
  const [phone, setPhone] = useState(shop?.phone || '');
  const [email, setEmail] = useState(shop?.email || '');
  const [maxQueue, setMaxQueue] = useState(shop?.maxQueue || 100);

  const [priceSettings, setPriceSettings] = useState({
    bwPerPage: shop?.priceSettings?.bwPerPage ?? 2.0,
    colorPerPage: shop?.priceSettings?.colorPerPage ?? 10.0,
    duplexDiscount: shop?.priceSettings?.duplexDiscount ?? 0.5,
    a3Multiplier: shop?.priceSettings?.a3Multiplier ?? 2.0,
    glossyPaperSurcharge: shop?.priceSettings?.glossyPaperSurcharge ?? 5.0,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handlePriceChange = (key, val) => {
    setPriceSettings((prev) => ({ ...prev, [key]: parseFloat(val) || 0 }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateOwnerShop(shop._id, {
        name,
        address,
        phone,
        email,
        maxQueue: parseInt(maxQueue, 10),
        priceSettings,
      });
      toast.success('Shop settings updated successfully!');
      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update shop settings';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-brand-600" />
          <span>Shop Profile & Pricing Rules</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure rates, capacity, and contact information for your xerox station
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Profile Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="font-bold text-slate-700 uppercase">Shop Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 uppercase">Phone Number</label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 uppercase">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 uppercase">Max Queue Capacity</label>
            <input
              type="number"
              min="10"
              max="1000"
              value={maxQueue}
              onChange={(e) => setMaxQueue(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="text-[10px] text-slate-400">Default 100 active jobs</span>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="font-bold text-slate-700 uppercase">Physical Address</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Pricing Rules */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
            <IndianRupee className="w-4 h-4 text-brand-600" />
            <span>Pricing Rules & Rates</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-slate-600">B&W Rate (₹/page)</label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={priceSettings.bwPerPage}
                onChange={(e) => handlePriceChange('bwPerPage', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600">Colour Rate (₹/page)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={priceSettings.colorPerPage}
                onChange={(e) => handlePriceChange('colorPerPage', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600">Duplex Discount (₹/sheet)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={priceSettings.duplexDiscount}
                onChange={(e) => handlePriceChange('duplexDiscount', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600">A3 Size Multiplier (x)</label>
              <input
                type="number"
                step="0.5"
                min="1"
                value={priceSettings.a3Multiplier}
                onChange={(e) => handlePriceChange('a3Multiplier', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600">Glossy Surcharge (₹/sheet)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={priceSettings.glossyPaperSurcharge}
                onChange={(e) => handlePriceChange('glossyPaperSurcharge', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-bold"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition flex items-center gap-2 shadow-md shadow-brand-500/20 active:scale-95"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
}

