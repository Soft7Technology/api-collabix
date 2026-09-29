import "dotenv/config";
import crypto from "crypto"

interface RazorpaySubscriptionResponse {
  id: string;
  entity: string;
  status: string;
  plan_id: string;
  total_count: number;
  paid_count: number;
  remaining_count: number;
  quantity: number;
}

interface RazorpaySubscriptionDetails {
  id: string;
  entity: string;
  status: string;
  plan_id: string;
  customer_id?: string | null;
  current_start?: number | null;
  current_end?: number | null;
  started_at?: number | null;
  ended_at?: number | null;
}

interface RazorpayErrorResponse {
  error?: {
    code?: string;
    description?: string;
    message?: string;
  };
}

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error(
    "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required."
  );
}

const basicAuth = Buffer.from(
  `${razorpayKeyId}:${razorpayKeySecret}`
).toString("base64");


export class RazorpayService{

  static async createRazorpaySubscription(params: {
    planId: string;
  totalCount: number;
  notes?: Record<string, string>;
}) {
  const response = await fetch(
    "https://api.razorpay.com/v1/subscriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_id: params.planId,
        total_count: params.totalCount,
        quantity: 1,
        customer_notify: true,
        notes: params.notes,
      }),
    }
  );

  const data = (await response.json()) as | RazorpaySubscriptionResponse | RazorpayErrorResponse;

 if (!response.ok) {
  if ("error" in data) {
    throw new Error(
      data.error?.description ||
      data.error?.message ||
      "Failed to create Razorpay subscription."
    );
  }

  throw new Error("Failed to create Razorpay subscription.");
}

  return data as RazorpaySubscriptionResponse;
}

static async verifyRazorpaySubscriptionPayment(params: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): Promise<boolean> {
  const { paymentId, subscriptionId, signature } = params;

  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret) {
    throw new Error("RAZORPAY_KEY_SECRET is not configured.");
  }

  const generatedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");

  return generatedSignature === signature;
}
static async getRazorpaySubscription(
  razorpaySubscriptionId: string,
) {
  const response = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${razorpaySubscriptionId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    },
  );

  const data = (await response.json()) as
    | RazorpaySubscriptionDetails
    | RazorpayErrorResponse;

  if (!response.ok) {
    if ("error" in data) {
      throw new Error(
        data.error?.description ||
          data.error?.message ||
          "Failed to fetch Razorpay subscription.",
      );
    }

    throw new Error("Failed to fetch Razorpay subscription.");
  }

  return data as RazorpaySubscriptionDetails;
}

static async verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signature: string
): Promise<boolean> {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured.");
  }

  const expectedSignature = crypto
  .createHmac("sha256", webhookSecret)
  .update(rawBody)
    .digest("hex");

    return expectedSignature === signature;
  }
  
  static async cancelRazorpaySubscription(
  razorpaySubscriptionId: string,
  cancelAtCycleEnd = true,
) {
  const response = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${razorpaySubscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
      }),
    },
  );

  const data = (await response.json()) as
    | RazorpaySubscriptionResponse
    | RazorpayErrorResponse;

  if (!response.ok) {
    if ("error" in data) {
      throw new Error(
        data.error?.description ||
          data.error?.message ||
          "Failed to cancel Razorpay subscription.",
      );
    }

    throw new Error("Failed to cancel Razorpay subscription.");
  }

  return data as RazorpaySubscriptionResponse;
}
}