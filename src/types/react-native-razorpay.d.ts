
declare module 'react-native-razorpay' {
  export interface RazorpayCheckoutOptions {
    key: string;
    amount: string | number;
    currency: string;
    name?: string;
    description?: string;
    order_id?: string;
    image?: string;
    prefill?: {
      email?: string;
      contact?: string;
      name?: string;
    };
    theme?: {
      color?: string;
    };
  }

  export interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  const RazorpayCheckout: {
    open(
      options: RazorpayCheckoutOptions,
    ): Promise<RazorpaySuccessResponse>;
  };

  export default RazorpayCheckout;
}
