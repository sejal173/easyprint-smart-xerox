import React, { useState, useEffect } from 'react';
import { AlertTriangle, Bell, Check, X, Printer, FileX, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchShopAlerts, markAlertRead } from '../../services/api';

export default function OwnerAlertsBanner({ shopId, liveAlert }) {
  const [alerts, setAlerts] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  const loadAlerts = async () => {
    if (!shopId) return;
    try {
      const data = await fetchShopAlerts(shopId);
      if (data.success && data.alerts) {
        // filter out read alerts
        setAlerts(data.alerts.filter((a) => !a.readAt));
      }
    } catch (err) {
      console.error('Failed to load shop alerts:', err);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [shopId]);

  // Handle incoming live alert
  useEffect(() => {
    if (!liveAlert) return;

    setAlerts((prev) => {
      // avoid duplicates by ID if present
      if (liveAlert._id && prev.some((a) => a._id === liveAlert._id)) {
        return prev;
      }
      return [liveAlert, ...prev];
    });

    // Fire browser notification if allowed
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`EasyPrint Alert: ${liveAlert.type || 'Printer Alert'}`, {
          body: liveAlert.message || 'Attention required at shop.',
          icon: '/favicon.ico',
        });
      } catch (e) {
        console.error('Error triggering Notification:', e);
      }
    }
  }, [liveAlert]);

  const handleRequestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Browser does not support notifications');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        toast.success('Desktop alerts enabled!');
      } else {
        toast('Notifications were not granted.');
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err);
    }
  };

  const handleDismiss = async (alertId) => {
    try {
      if (alertId && !alertId.startsWith('temp_')) {
        await markAlertRead(shopId, alertId);
      }
      setAlerts((prev) => prev.filter((a) => a._id !== alertId));
      toast.success('Alert dismissed');
    } catch (err) {
      console.error('Failed to mark alert as read:', err);
      // Remove locally anyway
      setAlerts((prev) => prev.filter((a) => a._id !== alertId));
    }
  };

  if (alerts.length === 0 && notificationPermission === 'granted') {
    return null;
  }

  return (
    <div className="space-y-2 mb-4">
      {/* Optional permission prompt pill */}
      {notificationPermission === 'default' && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-2 flex items-center justify-between text-xs text-sky-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-sky-600 animate-bounce" />
            <span>Enable desktop notifications to get instant alerts on printer jams, paper-out, and job errors.</span>
          </div>
          <button
            onClick={handleRequestPermission}
            className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg shadow-sm transition"
          >
            Enable Notifications
          </button>
        </div>
      )}

      {/* Render active alerts */}
      {alerts.map((alert) => {
        const isJobFailed = alert.type === 'job_failed';
        const isPaperOut = alert.type === 'paper_out';
        const isOffline = alert.type === 'printer_offline';

        const bgClass = isJobFailed
          ? 'bg-rose-50 border-rose-200 text-rose-900'
          : isPaperOut
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : isOffline
          ? 'bg-slate-100 border-slate-300 text-slate-800'
          : 'bg-orange-50 border-orange-200 text-orange-900';

        const iconClass = isJobFailed
          ? 'text-rose-600'
          : isPaperOut
          ? 'text-amber-600'
          : 'text-orange-600';

        return (
          <div
            key={alert._id || `${alert.type}-${alert.createdAt}`}
            className={`border rounded-xl p-3 flex items-start justify-between gap-3 shadow-sm ${bgClass}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {isJobFailed ? (
                  <FileX className={`w-5 h-5 ${iconClass}`} />
                ) : (
                  <AlertTriangle className={`w-5 h-5 ${iconClass}`} />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs uppercase tracking-wider">
                    {alert.type ? alert.type.replace('_', ' ') : 'System Alert'}
                  </span>
                  {alert.orderNumber && (
                    <span className="px-1.5 py-0.5 bg-black/10 rounded font-mono text-[10px] font-bold">
                      #{alert.orderNumber}
                    </span>
                  )}
                  <span className="text-[10px] opacity-75">
                    {alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString() : 'Just now'}
                  </span>
                </div>
                <p className="text-xs font-medium">{alert.message}</p>
              </div>
            </div>

            <button
              onClick={() => handleDismiss(alert._id)}
              className="p-1 hover:bg-black/10 rounded-lg text-slate-500 hover:text-slate-800 transition"
              title="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

