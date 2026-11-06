import { useEffect } from 'react';
import socket from '../services/socket';

/**
 * Hook to manage Socket.IO room subscription and events for a shop
 *
 * @param {string} shopId
 * @param {Object} handlers
 * @param {Function} [handlers.onQueueUpdated]
 * @param {Function} [handlers.onShopStatus]
 * @param {Function} [handlers.onOwnerAlert]
 */
export function useShopSocket(shopId, { onQueueUpdated, onShopStatus, onOwnerAlert } = {}) {
  useEffect(() => {
    if (!shopId) return;

    // Join room
    socket.emit('join:shop', shopId);

    const handleQueueUpdated = (data) => {
      if (data.shopId === shopId && onQueueUpdated) {
        onQueueUpdated(data);
      }
    };

    const handleShopStatus = (data) => {
      if (data.shopId === shopId && onShopStatus) {
        onShopStatus(data);
      }
    };

    const handleOwnerAlert = (data) => {
      if (onOwnerAlert) {
        onOwnerAlert(data);
      }
    };

    socket.on('queue.updated', handleQueueUpdated);
    socket.on('shop.status', handleShopStatus);
    socket.on('owner.alert', handleOwnerAlert);

    return () => {
      socket.off('queue.updated', handleQueueUpdated);
      socket.off('shop.status', handleShopStatus);
      socket.off('owner.alert', handleOwnerAlert);
    };
  }, [shopId, onQueueUpdated, onShopStatus, onOwnerAlert]);
}

export default useShopSocket;

