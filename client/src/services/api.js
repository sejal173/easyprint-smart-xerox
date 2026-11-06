import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
});

// Auth API
export const authRegister = async (data) => {
  const res = await api.post('/auth/register', data);
  return res.data;
};

export const authLogin = async (data) => {
  const res = await api.post('/auth/login', data);
  return res.data;
};

export const authLogout = async () => {
  const res = await api.post('/auth/logout');
  return res.data;
};

export const authGetMe = async () => {
  const res = await api.get('/auth/me');
  return res.data;
};

// Owner Shops API
export const fetchOwnerShops = async () => {
  const res = await api.get('/owner/shops');
  return res.data;
};

export const fetchOwnerShopById = async (id) => {
  const res = await api.get(`/owner/shops/${id}`);
  return res.data;
};

export const updateOwnerShop = async (id, data) => {
  const res = await api.put(`/owner/shops/${id}`, data);
  return res.data;
};

export const toggleShopStatus = async (id, isOnline) => {
  const res = await api.patch(`/owner/shops/${id}/status`, { isOnline });
  return res.data;
};

export const fetchOwnerQueue = async (shopId, status) => {
  const params = status ? { status } : {};
  const res = await api.get(`/owner/shops/${shopId}/queue`, { params });
  return res.data;
};

// Printers API
export const fetchPrinters = async (shopId) => {
  const res = await api.get(`/owner/shops/${shopId}/printers`);
  return res.data;
};

export const addPrinter = async (shopId, data) => {
  const res = await api.post(`/owner/shops/${shopId}/printers`, data);
  return res.data;
};

export const updatePrinter = async (shopId, printerId, data) => {
  const res = await api.put(`/owner/shops/${shopId}/printers/${printerId}`, data);
  return res.data;
};

export const deletePrinter = async (shopId, printerId) => {
  const res = await api.delete(`/owner/shops/${shopId}/printers/${printerId}`);
  return res.data;
};

// QR Code API
export const fetchOwnerQr = async (shopId) => {
  const res = await api.get(`/owner/shops/${shopId}/qr`);
  return res.data;
};

// Dev Mark-Paid API
export const devMarkOrderPaid = async (orderNumber) => {
  const res = await api.post(`/dev/orders/${orderNumber}/mark-paid`);
  return res.data;
};

export const fetchShopDetails = async (slug) => {
  const response = await api.get(`/shops/${slug}`);
  return response.data;
};

export const fetchShopQrCode = async (slug) => {
  const response = await api.get(`/shops/${slug}/qrcode`, { responseType: 'blob' });
  return response.data;
};

export const uploadPrintFiles = async (files, onProgress) => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });
  return response.data;
};

export const fetchPriceQuote = async ({ shopSlug, files, options }) => {
  const response = await api.post('/pricing/quote', {
    shopSlug,
    files,
    options,
  });
  return response.data;
};

export const createDraftOrder = async ({ shopSlug, customerPhone, fileIds, options }) => {
  const response = await api.post('/orders/draft', {
    shopSlug,
    customerPhone,
    fileIds,
    options,
  });
  return response.data;
};

export default api;

