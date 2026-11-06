import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, AlertTriangle } from 'lucide-react';

import Navbar from '../components/Navbar';
import ShopHeader from '../components/ShopHeader';
import FileUploader from '../components/FileUploader';
import FilePreviewList from '../components/FilePreviewList';
import PrintOptionsForm from '../components/PrintOptionsForm';
import PriceBreakdown from '../components/PriceBreakdown';
import QrCodeModal from '../components/QrCodeModal';
import OrderSummaryModal from '../components/OrderSummaryModal';

import { fetchShopDetails, fetchPriceQuote, createDraftOrder } from '../services/api';
import socket, { joinShopRoom } from '../services/socket';

const INITIAL_OPTIONS = {
  pageSelection: 'all',
  customRange: '',
  colorMode: 'bw',
  sides: 'single',
  paperSize: 'A4',
  paperQuality: 'normal',
  orientation: 'portrait',
  copies: 1,
  oddEven: 'all',
  pagesPerSheet: 1,
};

export default function CustomerShopPage() {
  const { slug } = useParams();

  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [shopError, setShopError] = useState(null);

  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [options, setOptions] = useState(INITIAL_OPTIONS);
  const [customerPhone, setCustomerPhone] = useState('');

  const [quote, setQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isOrderSummaryOpen, setIsOrderSummaryOpen] = useState(false);

  // 1. Fetch Shop details
  const loadShop = useCallback(async () => {
    try {
      setLoadingShop(true);
      const data = await fetchShopDetails(slug);
      if (data.success && data.shop) {
        setShop(data.shop);
        joinShopRoom(data.shop.id);
      }
    } catch (err) {
      console.error('Failed to load shop:', err);
      setShopError(err.response?.data?.message || 'Shop not found or unavailable');
    } finally {
      setLoadingShop(false);
    }
  }, [slug]);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  // 2. Listen to Socket.IO updates for live queue and shop status changes
  useEffect(() => {
    const handleQueueUpdate = () => {
      loadShop();
    };

    const handleShopStatus = (data) => {
      if (shop && data.shopId === shop.id) {
        setShop((prev) =>
          prev
            ? {
                ...prev,
                isOnline: data.isOnline,
                availability: data.isOnline
                  ? prev.queueLength >= 10
                    ? 'BUSY'
                    : 'ONLINE'
                  : 'OFFLINE',
              }
            : prev
        );
      } else {
        loadShop();
      }
    };

    socket.on('queue.updated', handleQueueUpdate);
    socket.on('shop.status', handleShopStatus);
    socket.on('shop.updated', handleQueueUpdate);

    return () => {
      socket.off('queue.updated', handleQueueUpdate);
      socket.off('shop.status', handleShopStatus);
      socket.off('shop.updated', handleQueueUpdate);
    };
  }, [loadShop, shop]);

  // 3. Recalculate Quote whenever uploaded files or options change
  useEffect(() => {
    if (!shop || uploadedFiles.length === 0) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingQuote(true);
      try {
        const filePayload = uploadedFiles.map((f) => ({
          pageCount: f.pageCount || 1,
        }));

        const result = await fetchPriceQuote({
          shopSlug: shop.slug,
          files: filePayload,
          options,
        });

        if (result.success) {
          setQuote(result);
        }
      } catch (err) {
        console.error('Quote error:', err);
      } finally {
        setLoadingQuote(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [shop, uploadedFiles, options]);

  // File Handlers
  const handleFilesUploaded = (newFiles) => {
    setUploadedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (fileId) => {
    setUploadedFiles((prev) => prev.filter((f) => f.fileId !== fileId));
    toast.success('Document removed');
  };

  // Reset form
  const handleResetForm = () => {
    setUploadedFiles([]);
    setOptions(INITIAL_OPTIONS);
    setCustomerPhone('');
    setQuote(null);
  };

  // Submit Draft Order
  const handleCreateDraft = async () => {
    if (!shop || uploadedFiles.length === 0) return;

    if (shop.availability === 'OFFLINE') {
      toast.error('This shop is currently offline and not taking orders.');
      return;
    }

    setIsCreatingDraft(true);
    try {
      const fileIds = uploadedFiles.map((f) => f.fileId);
      const result = await createDraftOrder({
        shopSlug: shop.slug,
        customerPhone,
        fileIds,
        options,
      });

      if (result.success && result.order) {
        setCreatedOrder(result.order);
        setIsOrderSummaryOpen(true);
        toast.success(`Draft Order ${result.order.orderNumber} created!`);
      }
    } catch (err) {
      console.error('Failed to create draft order:', err);
      const msg = err.response?.data?.message || 'Failed to create order';
      toast.error(msg);
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const isOffline = shop?.availability === 'OFFLINE';

  if (loadingShop) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-700">Connecting to EasyPrint Xerox Station...</p>
      </div>
    );
  }

  if (shopError || !shop) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-slate-200 text-center space-y-3">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Xerox Shop Not Found</h2>
          <p className="text-xs text-slate-500">{shopError || 'The shop URL appears to be invalid.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Shop Live Header & Availability Banner */}
        <ShopHeader shop={shop} onOpenQr={() => setIsQrModalOpen(true)} />

        {/* Upload Section */}
        <FileUploader
          onFilesUploaded={handleFilesUploaded}
          disabled={isOffline}
        />

        {/* Uploaded Documents List */}
        <FilePreviewList
          files={uploadedFiles}
          onRemoveFile={handleRemoveFile}
          disabled={isOffline}
        />

        {/* Print Settings Form */}
        <PrintOptionsForm
          options={options}
          onChange={setOptions}
          priceSettings={shop.priceSettings}
          disabled={isOffline || uploadedFiles.length === 0}
        />

        {/* Live Authoritative Server Pricing Breakdown */}
        <PriceBreakdown
          quote={quote}
          isLoading={loadingQuote}
          customerPhone={customerPhone}
          onPhoneChange={setCustomerPhone}
          onCreateDraft={handleCreateDraft}
          isCreatingDraft={isCreatingDraft}
          disabled={isOffline}
          hasFiles={uploadedFiles.length > 0}
        />
      </main>

      {/* QR Code Modal */}
      <QrCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        shop={shop}
      />

      {/* Draft Order Confirmation Modal */}
      <OrderSummaryModal
        isOpen={isOrderSummaryOpen}
        onClose={() => setIsOrderSummaryOpen(false)}
        order={createdOrder}
        onReset={handleResetForm}
      />
    </div>
  );
}

