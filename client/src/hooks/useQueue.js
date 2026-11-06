import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { fetchOwnerQueue, devMarkOrderPaid } from '../services/api';
import useShopSocket from './useShopSocket';

export function useQueue(shopId, initialStatus = '') {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [queueLength, setQueueLength] = useState(0);

  const loadQueue = useCallback(async () => {
    if (!shopId) return;
    try {
      const data = await fetchOwnerQueue(shopId, statusFilter);
      if (data.success) {
        setOrders(data.orders || []);
        setQueueLength(data.queueLength || 0);
      }
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      setLoading(false);
    }
  }, [shopId, statusFilter]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Real-time updates via Socket.IO
  useShopSocket(shopId, {
    onQueueUpdated: () => {
      loadQueue();
    },
  });

  const markPaid = async (orderNumber) => {
    try {
      const res = await devMarkOrderPaid(orderNumber);
      if (res.success) {
        toast.success(`Order #${orderNumber} marked paid & enqueued!`);
        await loadQueue();
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to mark order as paid';
      toast.error(msg);
    }
  };

  return {
    orders,
    loading,
    queueLength,
    statusFilter,
    setStatusFilter,
    refreshQueue: loadQueue,
    markPaidDev: markPaid,
  };
}

export default useQueue;

