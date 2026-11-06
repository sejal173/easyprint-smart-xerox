import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Copy,
  Clock,
  Printer,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Bell,
  CreditCard,
  CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import socket, { joinOrderRoom } from '../services/socket';
import { createPaymentOrder, verifyPayment, devMarkOrderPaid } from '../services/api';

export default function OrderSummaryModal({ isOpen, onClose, order: initialOrder, onReset }) {
  if (!isOpen || !initialOrder) return null;

  const [order, setOrder] = useState(initialOrder);
  const [paymentStatus, setPaymentStatus] = useState(
    initialOrder.status === 'draft' ? 'idle' : initialOrder.status
  );
  const [paymentError, setPaymentError] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState(false);

  // Sync internal state with props
  useEffect(() => {
    setOrder(initialOrder);
    setPaymentStatus(initialOrder.status === 'draft' ? 'idle' : initialOrder.status);
    if (initialOrder.status === 'completed') {
      setIsCompletedModalOpen(true);
    }
  }, [initialOrder]);

  // Join Socket.IO order room and listen to live updates
  useEffect(() => {
    if (!order?.orderNumber) return;

    joinOrderRoom(order.orderNumber);

    const handleOrderStatus = (data) => {
      if (data.orderNumber === order.orderNumber) {
        setOrder((prev) => ({
          ...prev,
          status: data.status,
          queuePosition: data.queuePosition ?? prev.queuePosition,
          ordersAhead: data.ordersAhead ?? prev.ordersAhead,
          eta: data.eta ?? prev.eta,
        }));
        setPaymentStatus(data.status);
      }
    };

    const handleOrderCompleted = (data) => {
      if (data.orderNumber === order.orderNumber) {
        setOrder((prev) => ({
          ...prev,
          status: 'completed',
          queueNumber: data.queueNumber ?? prev.queueNumber,
        }));
        setPaymentStatus('completed');
        setIsCompletedModalOpen(true);

        // Send browser notification if permission granted
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Print Ready!', {
              body: `Your print is ready. Please collect it from the counter. Queue number #${data.queueNumber || order.queueNumber}`,
              icon: '/favicon.ico',
            });
          } catch (e) {
            console.error('Notification error:', e);
          }
        }
      }
    };

    socket.on('order.status', handleOrderStatus);
    socket.on('order.completed', handleOrderCompleted);

    return () => {
      socket.off('order.status', handleOrderStatus);
      socket.off('order.completed', handleOrderCompleted);
    };
  }, [order?.orderNumber]);

  const handleCopyOrderNumber = () => {
    navigator.clipboard.writeText(order.orderNumber);
    toast.success('Order number copied to clipboard!');
  };

  // Request browser Notification permission on explicit user click
  const handleRequestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Browser notifications are not supported on this device.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setIsNotificationsEnabled(true);
        toast.success('Notifications enabled! We will alert you when your print is ready.');
      } else {
        toast.error('Notification permission was not granted.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not enable notifications.');
    }
  };

  // Initiate Payment / Retry Payment
  const handlePay = async () => {
    setIsProcessingPayment(true);
    setPaymentError(null);

    try {
      // 1. Create Razorpay order
      const res = await createPaymentOrder(order.orderNumber);
      if (res.success && res.razorpayOrderId) {
        // If in test or dev environment with no real razorpay keys loaded in frontend:
        if (window.Razorpay) {
          const rzp = new window.Razorpay({
            key: res.keyId,
            amount: res.amount,
            currency: res.currency,
            name: order.shop?.name || 'EasyPrint Xerox',
            description: `Order ${order.orderNumber}`,
            order_id: res.razorpayOrderId,
            handler: async (response) => {
              try {
                const verifyRes = await verifyPayment({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                });
                if (verifyRes.success) {
                  setPaymentStatus('queued');
                  toast.success('Payment verified! Your job is in the shop print queue.');
                }
              } catch (verifyErr) {
                setPaymentError('Payment verification failed.');
                setPaymentStatus('failed');
              }
            },
            modal: {
              ondismiss: () => {
                setPaymentError('Payment was cancelled or closed.');
                setPaymentStatus('failed');
              },
            },
            prefill: {
              contact: order.customerPhone || '',
            },
            theme: { color: '#0284c7' },
          });
          rzp.open();
        } else {
          // Dev fallback when Razorpay checkout script is unavailable
          const devRes = await devMarkOrderPaid(order.orderNumber);
          if (devRes.success) {
            setOrder((prev) => ({
              ...prev,
              status: 'queued',
              queueNumber: devRes.order?.queueNumber || 1,
            }));
            setPaymentStatus('queued');
            toast.success(`Payment simulated! Queue number: #${devRes.order?.queueNumber || 1}`);
          }
        }
      }
    } catch (err) {
      console.error('Payment error:', err);
      // Fallback to dev mark-paid for local testing if server allows
      try {
        const devRes = await devMarkOrderPaid(order.orderNumber);
        if (devRes.success) {
          setOrder((prev) => ({
            ...prev,
            status: 'queued',
            queueNumber: devRes.order?.queueNumber || 1,
          }));
          setPaymentStatus('queued');
          toast.success(`Order enqueued! Queue number: #${devRes.order?.queueNumber || 1}`);
          return;
        }
      } catch (devErr) {
        setPaymentError(err.response?.data?.message || 'Payment initiation failed. Please try again.');
        setPaymentStatus('failed');
        toast.error('Payment failed. Please retry.');
      }
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const isQueuedOrPrinting = ['queued', 'claimed', 'printing'].includes(order.status);
  const isFailed = order.status === 'failed' || paymentStatus === 'failed';
  const isPending = ['draft', 'pending_payment'].includes(order.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header Icon & Title */}
        <div className="text-center space-y-2 mb-5">
          {order.status === 'completed' ? (
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle className="w-8 h-8" />
            </div>
          ) : isQueuedOrPrinting ? (
            <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto shadow-inner animate-pulse">
              <Printer className="w-8 h-8" />
            </div>
          ) : isFailed ? (
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          )}

          <h2 className="text-xl font-extrabold text-slate-900">
            {order.status === 'completed'
              ? 'Print Complete!'
              : order.status === 'printing'
              ? 'Printing in Progress...'
              : order.status === 'queued'
              ? 'In Shop Print Queue'
              : isFailed
              ? 'Order Needs Attention'
              : 'Order Created'}
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {order.status === 'completed'
              ? 'Your document is ready for collection.'
              : order.status === 'printing'
              ? 'The printer is actively printing your document.'
              : order.status === 'queued'
              ? 'Your order is waiting in the queue.'
              : isFailed
              ? 'We encountered an issue processing this print job.'
              : 'Complete payment to send your document to the printer.'}
          </p>
        </div>

        {/* Order Number & Live Status Banner */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            Order Reference
          </span>
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-black font-mono text-slate-900 tracking-wider">
              {order.orderNumber}
            </span>
            <button
              onClick={handleCopyOrderNumber}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition"
              title="Copy Order Number"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 pt-1">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                order.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : order.status === 'printing'
                  ? 'bg-blue-100 text-blue-800'
                  : order.status === 'queued'
                  ? 'bg-amber-100 text-amber-800'
                  : order.status === 'failed'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {order.status}
            </span>
            {order.queueNumber && (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-brand-600 text-white shadow-xs">
                Queue #{order.queueNumber}
              </span>
            )}
          </div>
        </div>

        {/* Failed Order Alert Banner */}
        {order.status === 'failed' && (
          <div className="mt-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              Print failed, the shop has been notified.
            </div>
            <p className="text-rose-700 leading-relaxed">
              The shop operator has received an alert to check the printer paper and toner. They will reprint your job or refund your payment shortly.
            </p>
          </div>
        )}

        {/* Payment Failure / Retry Alert Banner */}
        {isPending && paymentError && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <span className="font-bold">Payment Notice:</span>
            <p className="text-amber-800">{paymentError}</p>
          </div>
        )}

        {/* Live Queue Progress (When Queued or Printing) */}
        {isQueuedOrPrinting && (
          <div className="mt-4 p-4 rounded-2xl bg-sky-50/70 border border-sky-100 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-sky-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-sky-600" />
                Estimated Wait Time:
              </span>
              <span className="font-bold text-sky-700">{order.eta || '1 - 2 mins'}</span>
            </div>

            {order.ordersAhead !== undefined && (
              <div className="text-xs text-sky-800 flex justify-between">
                <span>Orders ahead of you:</span>
                <span className="font-bold">{order.ordersAhead}</span>
              </div>
            )}

            {/* Notification Permission Prompt Button */}
            {!isNotificationsEnabled && (
              <button
                onClick={handleRequestNotification}
                className="w-full mt-2 py-2 px-3 rounded-xl bg-white hover:bg-sky-100/70 border border-sky-200 text-sky-800 font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <Bell className="w-4 h-4 text-sky-600" />
                Notify me when ready
              </button>
            )}
          </div>
        )}

        {/* Order Details Breakdown */}
        <div className="mt-4 space-y-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200/70">
            <span className="text-slate-500">Shop</span>
            <span className="font-bold text-slate-800">{order.shop?.name}</span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-slate-200/70">
            <span className="text-slate-500">Print Options</span>
            <span className="font-semibold text-slate-800">
              {order.options?.colorMode === 'color' ? 'Colour' : 'B&W'} •{' '}
              {order.options?.sides === 'double' ? 'Both Sides' : 'Single Side'} •{' '}
              {order.options?.paperSize}
            </span>
          </div>

          <div className="flex justify-between items-center pt-1">
            <span className="font-bold text-slate-900 text-sm">Total Price</span>
            <span className="text-lg font-black text-brand-700">₹{order.totalAmount?.toFixed(2)}</span>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="mt-5 space-y-2.5">
          {/* Pending Payment -> Pay / Retry Payment Button */}
          {isPending && (
            <button
              onClick={handlePay}
              disabled={isProcessingPayment}
              className="w-full py-3.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm tracking-wide transition active:scale-98 flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
            >
              {isProcessingPayment ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              {paymentError || order.status === 'pending_payment'
                ? `Retry Payment (₹${order.totalAmount?.toFixed(2)})`
                : `Pay ₹${order.totalAmount?.toFixed(2)} with Razorpay`}
            </button>
          )}

          {/* Close or Create Another Job */}
          <button
            onClick={() => {
              onClose();
              if (onReset && order.status === 'completed') onReset();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider transition"
          >
            {order.status === 'completed' ? 'Done / New Order' : 'Close Window'}
          </button>
        </div>

        {/* Customer Completed Popup Modal */}
        {isCompletedModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl border border-slate-100 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-black text-slate-900">Your Print is Ready!</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Please collect your document from the counter.
              </p>
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                <span className="text-xs font-semibold text-emerald-800">Your Queue Number</span>
                <div className="text-3xl font-black font-mono text-emerald-900">
                  #{order.queueNumber || '—'}
                </div>
              </div>
              <button
                onClick={() => {
                  setIsCompletedModalOpen(false);
                  onClose();
                  if (onReset) onReset();
                }}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition shadow-md"
              >
                Got It, Thank You!
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
