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

  return new Razorpay({
    key_id,
    key_secret,
  });
}

