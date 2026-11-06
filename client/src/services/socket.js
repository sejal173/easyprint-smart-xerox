import { io } from 'socket.io-client';

const SOCKET_URL = window.location.origin;

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export const joinShopRoom = (shopId) => {
  if (shopId) {
    socket.emit('join.shop', shopId);
  }
};

export const joinOrderRoom = (orderNumber) => {
  if (orderNumber) {
    socket.emit('join.order', orderNumber);
  }
};

export default socket;

