import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Download,
  Calendar,
  Clock,
  AlertOctagon,
  CheckCircle2,
  FileSpreadsheet,
  IndianRupee,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchShopAnalytics } from '../../services/api';

export default function EarningsTab({ shopId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [timeRange, setTimeRange] = useState('30'); // '7' | '30' | '90'
  const [hoveredBar, setHoveredBar] = useState(null);

  const loadAnalytics = async () => {
    if (!shopId) return;
    try {
      setLoading(true);
      const days = parseInt(timeRange, 10) || 30;
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const res = await fetchShopAnalytics(
        shopId,
        fromDate.toISOString().slice(0, 10),
        toDate.toISOString().slice(0, 10)
      );

      if (res.success) {
        setData(res);
      }
    } catch (err) {
      console.error('Failed to load shop analytics:', err);
      toast.error('Could not load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [shopId, timeRange]);

  const handleExportCsv = () => {
    const days = parseInt(timeRange, 10) || 30;
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const from = fromDate.toISOString().slice(0, 10);
    const to = toDate.toISOString().slice(0, 10);
    const apiUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    const csvUrl = `${apiUrl}/owner/shops/${shopId}/orders.csv?from=${from}&to=${to}`;
    
    // Download via link
    const link = document.createElement('a');
    link.href = csvUrl;
    link.setAttribute('download', `orders-export-${from}-to-${to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Downloading orders CSV...');
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-500">Calculating shop analytics & earnings...</p>
      </div>
    );
  }

  const series = data?.dailySeries || [];
  const maxRevenue = Math.max(...series.map((d) => d.revenue), 100);

  // Compute today's revenue & orders
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEntry = series.find((d) => d.date === todayStr) || { orders: 0, revenue: 0 };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-600" />
            <span>Earnings & Performance Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time financial breakdown, turnaround times, and order volume.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold text-slate-600">
            <button
              onClick={() => setTimeRange('7')}
              className={`px-3 py-1.5 rounded-lg transition ${
                timeRange === '7' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30')}
              className={`px-3 py-1.5 rounded-lg transition ${
                timeRange === '30' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange('90')}
              className={`px-3 py-1.5 rounded-lg transition ${
                timeRange === '90' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              90 Days
            </button>
          </div>

          <button
            onClick={loadAnalytics}
            className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition"
            title="Refresh analytics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Earnings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Today's Earnings</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <IndianRupee className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            ₹{todayEntry.revenue.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            {todayEntry.orders} order{todayEntry.orders !== 1 ? 's' : ''} today
          </div>
        </div>

        {/* Total Period Revenue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{timeRange}-Day Revenue</span>
            <span className="p-1.5 bg-brand-50 text-brand-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            ₹{(data?.revenue || 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Net: ₹{((data?.revenue || 0) - (data?.refundsTotal || 0)).toFixed(2)} (₹{data?.refundsTotal || 0} refunded)
          </div>
        </div>

        {/* Avg Turnaround Time */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Avg Turnaround</span>
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {data?.averageTurnaroundFormatted || '0s'}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Paid to completed printing
          </div>
        </div>

        {/* Failure Rate */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Failure Rate</span>
            <span className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <AlertOctagon className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {((data?.failureRate || 0) * 100).toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            {data?.totalOrders || 0} total order{data?.totalOrders !== 1 ? 's' : ''} in range
          </div>
        </div>
      </div>

      {/* SVG Bar Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Revenue Trend (Daily)</h3>
            <p className="text-xs text-slate-500">Daily gross print collections over the selected period</p>
          </div>
          {hoveredBar && (
            <div className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-semibold shadow flex items-center gap-2 animate-in fade-in">
              <span className="text-slate-400">{hoveredBar.date}:</span>
              <span>₹{hoveredBar.revenue.toFixed(2)}</span>
              <span className="text-[10px] text-brand-300">({hoveredBar.orders} orders)</span>
            </div>
          )}
        </div>

        {series.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No order transactions recorded in this period yet.
          </div>
        ) : (
          <div className="w-full">
            <div className="h-48 flex items-end gap-1.5 sm:gap-2 pt-6 pb-2 border-b border-slate-100">
              {series.map((item) => {
                const heightPct = Math.max(Math.round((item.revenue / maxRevenue) * 100), 4);
                const isHovered = hoveredBar?.date === item.date;

                return (
                  <div
                    key={item.date}
                    className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer"
                    onMouseEnter={() => setHoveredBar(item)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-md transition-all duration-150 ${
                        isHovered
                          ? 'bg-brand-600 shadow-md scale-y-105'
                          : item.revenue > 0
                          ? 'bg-brand-400 hover:bg-brand-500'
                          : 'bg-slate-200'
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {/* X-Axis Dates */}
            <div className="flex justify-between text-[10px] font-semibold text-slate-400 pt-2 px-1">
              <span>{series[0]?.date}</span>
              {series.length > 2 && (
                <span>{series[Math.floor(series.length / 2)]?.date}</span>
              )}
              <span>{series[series.length - 1]?.date}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

