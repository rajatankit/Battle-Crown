// lib/cashfree.js
//
// Cashfree Payment Gateway helper — order creation + webhook signature verification.
//
// REQUIRED ENV VARS (add these to .env / Vercel project settings):
//   CASHFREE_APP_ID        -> from Cashfree dashboard
//   CASHFREE_SECRET_KEY    -> from Cashfree dashboard (also used to verify webhook signatures)
//   CASHFREE_ENV           -> "TEST" or "PROD"
//   NEXT_PUBLIC_APP_URL    -> e.g. https://battle-crown.vercel.app (used for return_url)
//
// Docs reference: Cashfree Payment Gateway API version 2023-08-01

import crypto from "crypto";
import { logCortexError } from "@/app/lib/cortex/errorLogger";

const CASHFREE_BASE_URL =
  process.env.CASHFREE_ENV === "PROD"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

const API_VERSION = "2023-08-01";

/**
 * Creates a Cashfree order for a tournament entry fee.
 *
 * @param {Object} params
 * @param {string} params.orderId - unique order id, e.g. bc_{tournamentId}_{userId}_{timestamp}
 * @param {number} params.amount - entry fee amount in INR
 * @param {string} params.customerId - your internal user id (as string)
 * @param {string} params.customerPhone - customer phone (Cashfree requires a phone number)
 * @param {string} [params.customerEmail] - customer email (optional but recommended)
 * @param {string} [params.returnUrl] - override the default return_url (goes to /dashboard by default)
 * @returns {Promise<{payment_session_id: string, order_id: string, cf_order_id: string}>}
 */
export async function createCashfreeOrder({
  orderId,
  amount,
  customerId,
  customerPhone,
  customerEmail,
  returnUrl,
}) {
  if (!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY) {
    throw new Error(
      "Cashfree credentials missing: set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in env"
    );
  }
  if (!amount || amount <= 0) {
    throw new Error("Invalid amount for Cashfree order");
  }
  if (!customerPhone) {
    throw new Error("customerPhone is required by Cashfree to create an order");
  }

  // Defaults to the dashboard, where checkPaymentStatus() polls /api/payment/status
  const finalReturnUrl =
    returnUrl ||
    `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?order_id={order_id}`;

  const body = {
    order_id: orderId,
    order_amount: Number(amount),
    order_currency: "INR",
    customer_details: {
      customer_id: String(customerId),
      customer_phone: String(customerPhone),
      ...(customerEmail ? { customer_email: customerEmail } : {}),
    },
    order_meta: {
      // Cashfree redirects the browser here after checkout (not the source of truth —
      // the webhook below is what actually confirms payment)
      return_url: finalReturnUrl,
    },
  };

  const res = await fetch(`${CASHFREE_BASE_URL}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": process.env.CASHFREE_APP_ID,
      "x-client-secret": process.env.CASHFREE_SECRET_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Cashfree order creation failed: ${data?.message || res.statusText}`
    );
  }

  return {
    payment_session_id: data.payment_session_id,
    order_id: data.order_id,
    cf_order_id: data.cf_order_id,
  };
}

/**
 * Verifies a Cashfree webhook's authenticity using HMAC-SHA256.
 * Cashfree signs: timestamp + rawRequestBody, using your secret key.
 *
 * @param {string} rawBody - the exact raw request body string (NOT re-serialized JSON)
 * @param {string} signatureHeader - value of "x-webhook-signature" header
 * @param {string} timestampHeader - value of "x-webhook-timestamp" header
 * @returns {boolean}
 */
export function verifyCashfreeSignature(rawBody, signatureHeader, timestampHeader) {
  if (!signatureHeader || !timestampHeader) return false;
  if (!process.env.CASHFREE_SECRET_KEY) {
    throw new Error("CASHFREE_SECRET_KEY missing — cannot verify webhook");
  }

  const signedPayload = timestampHeader + rawBody;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
    .update(signedPayload)
    .digest("base64");

  const expectedBuf = Buffer.from(expectedSignature);
  const receivedBuf = Buffer.from(signatureHeader);

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Optional: fetch order status directly from Cashfree (useful for a manual
 * "check payment status" button/poll, as a backup to the webhook).
 */
export async function getCashfreeOrderStatus(orderId) {
  const res = await fetch(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
    method: "GET",
    headers: {
      "x-api-version": API_VERSION,
      "x-client-id": process.env.CASHFREE_APP_ID,
      "x-client-secret": process.env.CASHFREE_SECRET_KEY,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Cashfree order status fetch failed: ${data?.message || res.statusText}`);
  }
  return data;
}