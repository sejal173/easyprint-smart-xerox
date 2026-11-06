import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Store,
  FileText,
  CreditCard,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  LogOut,
  ChevronRight,
  Loader2,
  RefreshCw,
  Eye,
  X,
  IndianRupee,
  ShieldCheck,
  UserX,
  UserCheck,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { useAuth } from '../../context/AuthContext';
import {
  fetchAdminShops,
  updateAdminShopStatus,
  fetchAdminOrders,
  fetchAdminOrderByNumber,
  fetchAdminPayments,
  fetchAdminUsers,
  updateAdminUser,
} from '../../services/api';

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('shops'); // 'shops' | 'orders' | 'payments' | 'users'
  const [loading, setLoading] = useState(false);

  // Shops State
  const [shops, setShops] = useState([]);
  const [shopSearch, setShopSearch] = useState('');
  const [shopStatusFilter, setShopStatusFilter] = useState('all');

  // Orders State
  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Payments State
  const [payments, setPayments] = useState([]);
  const [paymentRevenue, setPaymentRevenue] = useState(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');

  // Users State
  const [users, setUsers] = useState([]);
  const [userRoleFilter, setUserRoleFilter] = useState('all');

  // Load active tab data
  useEffect(() => {
    if (activeTab === 'shops') loadShops();
    if (activeTab === 'orders') loadOrders();
    if (activeTab === 'payments') loadPayments();
    if (activeTab === 'users') loadUsers();
  }, [activeTab, shopStatusFilter, orderStatusFilter, paymentStatusFilter, userRoleFilter]);

  const loadShops = async () => {
    try {
      setLoading(true);
      const params = {};
      if (shopStatusFilter !== 'all') params.status = shopStatusFilter;
      if (shopSearch) params.search = shopSearch;
      const res = await fetchAdminShops(params);
      if (res.success) setShops(res.shops);
    } catch (err) {
      toast.error('Failed to load shops');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleShopStatus = async (shop) => {
    const newStatus = shop.status === 'suspended' ? 'active' : 'suspended';
    try {
      const res = await updateAdminShopStatus(shop.id, newStatus);
      if (res.success) {
        toast.success(res.message);
        setShops((prev) =>
          prev.map((s) => (s.id === shop.id ? { ...s, status: newStatus } : s))
        );
      }
    } catch (err) {
      toast.error('Failed to update shop status');
    }
  };

  const loadOrders = async () => {
    try {
      setLoading(true);
      const params = {};
      if (orderStatusFilter !== 'all') params.status = orderStatusFilter;
      const res = await fetchAdminOrders(params);
      if (res.success) setOrders(res.orders);
    } catch (err) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleViewTimeline = async (orderNumber) => {
    try {
      setLoadingTimeline(true);
      const res = await fetchAdminOrderByNumber(orderNumber);
      if (res.success) {
        setSelectedOrderDetails(res);
      }
    } catch (err) {
      toast.error('Could not load order timeline');
    } finally {
      setLoadingTimeline(false);
    }
  };

  const loadPayments = async () => {
    try {
      setLoading(true);
      const params = {};
      if (paymentStatusFilter !== 'all') params.status = paymentStatusFilter;
      const res = await fetchAdminPayments(params);
      if (res.success) {
        setPayments(res.payments);
        setPaymentRevenue(res.revenue);
      }
    } catch (err) {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const params = {};
      if (userRoleFilter !== 'all') params.role = userRoleFilter;
      const res = await fetchAdminUsers(params);
      if (res.success) setUsers(res.users);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (targetUser, updates) => {
    if (targetUser.id === user?.id) {
      toast.error('You cannot modify your own administrator account');
      return;
    }
    try {
      const res = await updateAdminUser(targetUser.id, updates);
      if (res.success) {
        toast.success(res.message);
        setUsers((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, ...res.user } : u))
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/owner/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-wide text-white">EasyPrint</span>
                <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-black rounded-md uppercase tracking-wider">
                  Super Admin
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Global System Management & Audit Log</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="hidden sm:inline text-slate-400 font-medium">{user?.email}</span>
            <Link
              to="/owner"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-medium"
            >
              Owner Portal
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 transition font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
          {[
            { id: 'shops', label: 'Shops Management', icon: Store, count: shops.length },
            { id: 'orders', label: 'Platform Orders', icon: FileText, count: orders.length },
            { id: 'payments', label: 'Financials & Payments', icon: CreditCard },
            { id: 'users', label: 'Users & Roles', icon: Users, count: users.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  isActive
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* 1. SHOPS TAB */}
        {activeTab === 'shops' && (
          <div className="space-y-4">
            <div className="bg-slate-800/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search shops by name, slug, email..."
                  value={shopSearch}
                  onChange={(e) => setShopSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadShops()}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <select
                  value={shopStatusFilter}
                  onChange={(e) => setShopStatusFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                >
                  <option value="all">All Shop Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="suspended">Suspended Only</option>
                </select>

                <button
                  onClick={loadShops}
                  className="p-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-400 transition"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex justify-center">
                <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">Shop</th>
                        <th className="px-5 py-3.5">Owner</th>
                        <th className="px-5 py-3.5">Printers</th>
                        <th className="px-5 py-3.5">Presence</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {shops.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-5 py-12 text-center text-slate-500">
                            No shops found matching filter criteria.
                          </td>
                        </tr>
                      ) : (
                        shops.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-900/40 transition">
                            <td className="px-5 py-4">
                              <div className="font-bold text-white text-sm">{s.name}</div>
                              <div className="text-[11px] text-slate-500 font-mono">/s/{s.slug}</div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="text-white font-medium">{s.owner?.name || 'Owner'}</div>
                              <div className="text-[11px] text-slate-500">{s.owner?.email}</div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="px-2 py-0.5 bg-slate-800 rounded-md text-[11px] font-mono">
                                {s.printerCount} printer{s.printerCount !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  s.isOnline
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${s.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                                {s.isOnline ? 'Online' : 'Offline'}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                  s.status === 'suspended'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                }`}
                              >
                                {s.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() => handleToggleShopStatus(s)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                  s.status === 'suspended'
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    : 'bg-rose-600/80 hover:bg-rose-600 text-white'
                                }`}
                              >
                                {s.status === 'suspended' ? 'Activate Shop' : 'Suspend Shop'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="bg-slate-800/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400 font-semibold">
                Platform-wide order feed with end-to-end event logs
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
                >
                  <option value="all">All Order Statuses</option>
                  <option value="queued">Queued</option>
                  <option value="printing">Printing</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="refunded">Refunded</option>
                </select>

                <button
                  onClick={loadOrders}
                  className="p-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-400 transition"
                  title="Refresh orders"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-20 flex justify-center">
                <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="px-5 py-3.5">Order Number</th>
                        <th className="px-5 py-3.5">Shop</th>
                        <th className="px-5 py-3.5">Amount</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5">Date</th>
                        <th className="px-5 py-3.5 text-right">Audit Timeline</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-5 py-12 text-center text-slate-500">
                            No orders found.
                          </td>
                        </tr>
                      ) : (
                        orders.map((o) => (
                          <tr key={o.id} className="hover:bg-slate-900/40 transition">
                            <td className="px-5 py-4 font-mono font-bold text-white">
                              #{o.orderNumber}
                              {o.queueNumber && (
                                <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded">
                                  Q #{o.queueNumber}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <div className="text-white font-medium">{o.shop?.name || 'Shop'}</div>
                              <div className="text-[11px] text-slate-500">/s/{o.shop?.slug}</div>
                            </td>
                            <td className="px-5 py-4 font-bold text-white">
                              ₹{(o.totalAmount || 0).toFixed(2)}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                  o.status === 'completed'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : o.status === 'failed'
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : o.status === 'printing'
                                    ? 'bg-indigo-500/20 text-indigo-300 animate-pulse'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {o.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-slate-400 text-[11px]">
                              {new Date(o.createdAt).toLocaleString()}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() => handleViewTimeline(o.orderNumber)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Timeline</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            {/* Platform Revenue KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-1">
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Total Collected (Gross)
                </div>
                <div className="text-2xl font-black text-white">
                  ₹{(paymentRevenue?.paidRupees || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500">Gross Razorpay payment captures</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-1">
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Total Refunded
                </div>
                <div className="text-2xl font-black text-rose-400">
                  ₹{(paymentRevenue?.refundedRupees || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500">Refunds processed through gateway</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-1">
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Net Platform Revenue
                </div>
                <div className="text-2xl font-black text-emerald-400">
                  ₹{(paymentRevenue?.netRevenueRupees || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500">Net revenue retained on platform</div>
              </div>
            </div>

            {/* Payments Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Razorpay Transaction Log
                </h3>

                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                >
                  <option value="all">All Payments</option>
                  <option value="paid">Paid</option>
                  <option value="refunded">Refunded</option>
                  <option value="failed">Failed</option>
                  <option value="created">Created</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">Payment ID</th>
                      <th className="px-5 py-3.5">Order</th>
                      <th className="px-5 py-3.5">Shop</th>
                      <th className="px-5 py-3.5">Amount</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-5 py-12 text-center text-slate-500">
                          No payments recorded.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-900/40 transition">
                          <td className="px-5 py-4 font-mono font-medium text-slate-300">
                            {p.razorpayPaymentId || p.razorpayOrderId || p.id}
                            {p.refundId && (
                              <div className="text-[10px] text-rose-400">Refund: {p.refundId}</div>
                            )}
                          </td>
                          <td className="px-5 py-4 font-bold text-white font-mono">
                            {p.order?.orderNumber ? `#${p.order.orderNumber}` : '—'}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {p.order?.shop?.name || '—'}
                          </td>
                          <td className="px-5 py-4 font-bold text-white">
                            ₹{(p.amountRupees || p.amount / 100).toFixed(2)}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                p.status === 'paid'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : p.status === 'refunded'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate-400 text-[11px]">
                            {new Date(p.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. USERS TAB */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="bg-slate-800/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400 font-semibold">
                Platform user accounts, role-based access control, and suspension flags
              </div>

              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none"
              >
                <option value="all">All Roles</option>
                <option value="owner">Owners Only</option>
                <option value="admin">Super Admins Only</option>
              </select>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">User</th>
                      <th className="px-5 py-3.5">Email</th>
                      <th className="px-5 py-3.5">Role</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Created</th>
                      <th className="px-5 py-3.5 text-right">RBAC Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {users.map((u) => {
                      const isSelf = u.id === user?.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-900/40 transition">
                          <td className="px-5 py-4 font-bold text-white flex items-center gap-2">
                            <span>{u.name}</span>
                            {isSelf && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-rose-500/20 text-rose-300 rounded">
                                (You)
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-slate-400">{u.email}</td>
                          <td className="px-5 py-4">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                u.role === 'admin'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                u.isSuspended
                                  ? 'bg-rose-900/50 text-rose-400 border border-rose-700/50'
                                  : 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40'
                              }`}
                            >
                              {u.isSuspended ? 'Suspended' : 'Active'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate-400 text-[11px]">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-4 text-right space-x-2">
                            {/* Role Toggle */}
                            <button
                              disabled={isSelf}
                              onClick={() =>
                                handleUpdateUser(u, {
                                  role: u.role === 'admin' ? 'owner' : 'admin',
                                })
                              }
                              title={isSelf ? 'Cannot demote self' : 'Toggle role'}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                                isSelf
                                  ? 'opacity-30 cursor-not-allowed bg-slate-800 text-slate-500'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                              }`}
                            >
                              {u.role === 'admin' ? 'Demote to Owner' : 'Make Admin'}
                            </button>

                            {/* Suspend / Unsuspend */}
                            <button
                              disabled={isSelf}
                              onClick={() =>
                                handleUpdateUser(u, {
                                  isSuspended: !u.isSuspended,
                                })
                              }
                              title={isSelf ? 'Cannot suspend self' : 'Toggle suspension'}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                isSelf
                                  ? 'opacity-30 cursor-not-allowed bg-slate-800 text-slate-500'
                                  : u.isSuspended
                                  ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                                  : 'bg-rose-700 hover:bg-rose-600 text-white'
                              }`}
                            >
                              {u.isSuspended ? 'Unsuspend' : 'Suspend'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Order Event Timeline Modal */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 text-white shadow-2xl space-y-6 my-8 animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl font-black">
                    #{selectedOrderDetails.order.orderNumber}
                  </span>
                  <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold rounded uppercase">
                    {selectedOrderDetails.order.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Shop: {selectedOrderDetails.order.shop?.name} • Phone: {selectedOrderDetails.order.customerPhone} • Total: ₹{selectedOrderDetails.order.totalAmount}
                </p>
              </div>

              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Timeline */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Chronological Audit Trail ({selectedOrderDetails.timeline.length} events)
              </h4>

              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-700">
                {selectedOrderDetails.timeline.map((ev, idx) => (
                  <div key={ev.id || idx} className="relative group">
                    {/* Dot */}
                    <div className="absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-slate-900 ring-2 ring-rose-500/20" />
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-rose-300 font-mono">{ev.type}</span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(ev.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {ev.data && Object.keys(ev.data).length > 0 && (
                        <pre className="text-[10px] font-mono bg-slate-900 p-2 rounded text-slate-400 overflow-x-auto">
                          {JSON.stringify(ev.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

