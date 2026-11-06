import React, { useState } from 'react';
import { Clock, RefreshCw, Zap, CheckCircle2, AlertCircle, FileText, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';

export default function QueueTab({
  orders = [],
  loading = false,
  queueLength = 0,
  statusFilter = '',
  onStatusFilterChange,
  onRefresh,
  onMarkPaidDev,
}) {
  const [devOrderInput, setDevOrderInput] = useState('');
  const [isSubmittingDev, setIsSubmittingDev] = useState(false);

  const handleDevSubmit = async (e) => {
    e.preventDefault();
    if (!devOrderInput.trim()) return;

    setIsSubmittingDev(true);
    try {
      await onMarkPaidDev(devOrderInput.trim());
      setDevOrderInput('');
    } finally {
      setIsSubmittingDev(false);
    }
  };

  const isDevMode = import.meta.env.MODE !== 'production';

  return (
    <div className="space-y-6">
      {/* Top stats & controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand-600" />
            <span>Live FIFO Queue</span>
            <span className="text-xs font-bold bg-brand-50 text-brand-700 px-2.5 py-0.5 rounded-full border border-brand-200">
              {queueLength} Active
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Orders processed strictly in first-come, first-served sequence
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status filters */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => onStatusFilterChange('')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === ''
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({queueLength})
            </button>
            <button
              onClick={() => onStatusFilterChange('queued')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'queued'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Queued
            </button>
            <button
              onClick={() => onStatusFilterChange('printing')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'printing'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Printing
            </button>
          </div>

          <button
            onClick={onRefresh}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
            title="Refresh queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dev Mode "Mark Paid" Quick Simulator */}
      {isDevMode && (
        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber-900">
                Development Queue Testing Tool
              </div>
              <div className="text-[11px] text-amber-700">
                Mark any draft order as paid to simulate live Razorpay payment and test the BullMQ queue
              </div>
            </div>
          </div>

          <form onSubmit={handleDevSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={devOrderInput}
              onChange={(e) => setDevOrderInput(e.target.value)}
              placeholder="e.g. EP-261106-0001"
              className="px-3 py-1.5 text-xs font-mono bg-white rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
            />
            <button
              type="submit"
              disabled={isSubmittingDev || !devOrderInput.trim()}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs transition active:scale-95 shadow-xs"
            >
              {isSubmittingDev ? 'Marking...' : 'Mark Paid (dev)'}
            </button>
          </form>
        </div>
      )}

      {/* Live Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">Queue is Clear!</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are currently no print jobs waiting. New customer orders will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Queue #</th>
                  <th className="py-3 px-4">Order Number</th>
                  <th className="py-3 px-4">Customer File</th>
                  <th className="py-3 px-4">Print Options</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Paid Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {orders.map((order) => {
                  const isPrinting = order.status === 'printing';

                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isPrinting ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      {/* Queue Number */}
                      <td className="py-3.5 px-4 font-black text-slate-900 text-sm">
                        #{order.queueNumber || '-'}
                      </td>

                      {/* Order Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-brand-700">
                        {order.orderNumber}
                      </td>

                      {/* Customer File */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 max-w-xs truncate" title={order.firstFileName}>
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">{order.firstFileName}</span>
                          {order.fileCount > 1 && (
                            <span className="text-[10px] text-slate-400">+{order.fileCount - 1}</span>
                          )}
                        </div>
                      </td>

                      {/* Print Options */}
                      <td className="py-3.5 px-4 text-slate-500">
                        {order.optionsSummary}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                            isPrinting
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isPrinting ? 'bg-amber-500 animate-ping' : 'bg-blue-500'
                            }`}
                          />
                          {order.status}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        ₹{order.totalAmount?.toFixed(2)}
                      </td>

                      {/* Paid Time */}
                      <td className="py-3.5 px-4 text-slate-400">
                        {order.paidAt ? new Date(order.paidAt).toLocaleTimeString() : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

