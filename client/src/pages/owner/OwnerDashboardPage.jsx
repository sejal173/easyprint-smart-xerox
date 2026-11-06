import React, { useState, useEffect } from 'react';
import { Clock, Printer, QrCode, Sliders, Loader2, AlertCircle, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

import OwnerNavbar from '../../components/owner/OwnerNavbar';
import QueueTab from '../../components/owner/QueueTab';
import PrintersTab from '../../components/owner/PrintersTab';
import ShopSettingsTab from '../../components/owner/ShopSettingsTab';
import QrCodeTab from '../../components/owner/QrCodeTab';
import EarningsTab from '../../components/owner/EarningsTab';
import OwnerAlertsBanner from '../../components/owner/OwnerAlertsBanner';

import { fetchOwnerShops, toggleShopStatus } from '../../services/api';
import useQueue from '../../hooks/useQueue';
import useShopSocket from '../../hooks/useShopSocket';

export default function OwnerDashboardPage() {
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [loadingShops, setLoadingShops] = useState(true);
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'printers' | 'qr' | 'settings' | 'earnings'
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);
  const [liveAlert, setLiveAlert] = useState(null);

  const loadShops = async () => {
    try {
      setLoadingShops(true);
      const data = await fetchOwnerShops();
      if (data.success && data.shops?.length > 0) {
        setShops(data.shops);
        setSelectedShop(data.shops[0]);
      }
    } catch (err) {
      console.error('Failed to load owner shops:', err);
      toast.error('Could not load your shop details');
    } finally {
      setLoadingShops(false);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  // Live queue hook
  const {
    orders,
    loading: loadingQueue,
    queueLength,
    statusFilter,
    setStatusFilter,
    refreshQueue,
    markPaidDev,
  } = useQueue(selectedShop?._id);

  // Listen to socket shop.status and owner.alert updates
  useShopSocket(selectedShop?._id, {
    onShopStatus: (data) => {
      setSelectedShop((prev) => (prev ? { ...prev, isOnline: data.isOnline } : prev));
    },
    onOwnerAlert: (alertData) => {
      setLiveAlert(alertData);
    },
  });

  const handleToggleOnline = async () => {
    if (!selectedShop) return;
    setIsTogglingOnline(true);
    const newStatus = !selectedShop.isOnline;

    try {
      const res = await toggleShopStatus(selectedShop._id, newStatus);
      if (res.success) {
        setSelectedShop((prev) => ({ ...prev, isOnline: res.isOnline }));
        toast.success(res.message);
      }
    } catch (err) {
      toast.error('Failed to change shop status');
    } finally {
      setIsTogglingOnline(false);
    }
  };

  if (loadingShops) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-700">Loading your shop dashboard...</p>
      </div>
    );
  }

  if (!selectedShop) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-slate-200 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">No Shops Found</h2>
          <p className="text-xs text-slate-500">You don't have any registered xerox shops yet.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'queue', label: 'Live Queue', icon: Clock, badge: queueLength },
    { id: 'earnings', label: 'Earnings & Analytics', icon: TrendingUp },
    { id: 'printers', label: 'Printers', icon: Printer, badge: selectedShop.printers?.length },
    { id: 'qr', label: 'Shop QR Standee', icon: QrCode },
    { id: 'settings', label: 'Shop Profile & Rates', icon: Sliders },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OwnerNavbar
        shop={selectedShop}
        onToggleOnline={handleToggleOnline}
        isTogglingOnline={isTogglingOnline}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Persistent & Live Alerts Banner */}
        <OwnerAlertsBanner shopId={selectedShop._id} liveAlert={liveAlert} />

        {/* Navigation Tab Bar */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto print:hidden">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'queue' && (
          <QueueTab
            orders={orders}
            loading={loadingQueue}
            queueLength={queueLength}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onRefresh={refreshQueue}
            onMarkPaidDev={markPaidDev}
          />
        )}

        {activeTab === 'earnings' && <EarningsTab shopId={selectedShop._id} />}

        {activeTab === 'printers' && (
          <PrintersTab
            shopId={selectedShop._id}
            printers={selectedShop.printers}
            onRefresh={loadShops}
          />
        )}

        {activeTab === 'qr' && <QrCodeTab shop={selectedShop} />}

        {activeTab === 'settings' && (
          <ShopSettingsTab shop={selectedShop} onRefresh={loadShops} />
        )}
      </main>
    </div>
  );
}

