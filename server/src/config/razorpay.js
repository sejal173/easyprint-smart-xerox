import Razorpay from 'razorpay';

let mockRazorpayInstance = null;

/**
 * For testing purposes: inject a mock Razorpay client
 */
export function setMockRazorpayClient(mockClient) {
  mockRazorpayInstance = mockClient;
}

/**
 * Returns active Razorpay SDK client or mock
 */
export function getRazorpayClient() {
  if (mockRazorpayInstance) {
    return mockRazorpayInstance;
  }

  const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
  const key_secret = process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder';

  // In development/test mode with placeholder credentials, return a local mock client ONLY if simulation is explicitly allowed
  const allowSimulation =
    process.env.ALLOW_DEV_PAYMENT_SIMULATION === 'true' && process.env.NODE_ENV !== 'production';

  if (allowSimulation && (key_id.includes('placeholder') || !process.env.RAZORPAY_KEY_ID)) {
    return {
      orders: {
        create: async (params) => ({
          id: `order_dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          entity: 'order',
          amount: params.amount,
          amount_paid: 0,
          amount_due: params.amount,
          currency: params.currency || 'INR',
          receipt: params.receipt,
          status: 'created',
          attempts: 0,
          notes: params.notes,
          created_at: Math.floor(Date.now() / 1000),
        }),
      },
      payments: {
        refund: async (paymentId, params) => ({
          id: `rfnd_dev_${Date.now()}`,
          entity: 'refund',
          amount: params?.amount || 0,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
        }),
      },
    };
  }

  return new Razorpay({
    key_id,
    key_secret,
  });
}

