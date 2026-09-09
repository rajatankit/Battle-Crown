// app/api/webhooks/cashfree/route.js
//
// This is the SOURCE OF TRUTH for "did the payment actually succeed".
// Configure this exact URL in your Cashfree dashboard -> Developers -> Webhooks:
//   https://yourdomain.com/api/webhooks/cashfree
//
// Adjust this import to your actual project path:
import { prisma } from "@/app/lib/prisma";

import { verifyCashfreeSignature } from "@/app/lib/cashfree";
import { NextResponse } from "next/server";

// Next.js app router gives you the raw body via req.text() as long as you
// don't call req.json() first — that's important, signature verification
// needs the EXACT raw bytes Cashfree sent.
export async function POST(req) {
  let rawBody;
  try {
    rawBody = await req.text();
  } catch (err) {
    console.error("Webhook: failed to read body", err);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");

  // 1. Verify authenticity FIRST, before touching the payload at all
  let isValid = false;
  try {
    isValid = verifyCashfreeSignature(rawBody, signature, timestamp);
  } catch (err) {
    console.error("Webhook: signature verification error", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }

  if (!isValid) {
    console.warn("Webhook: invalid signature — possible spoofed request");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Now it's safe to parse
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Cashfree sends several event types — we only act on successful payments
  if (payload.type !== "PAYMENT_SUCCESS_WEBHOOK") {
    return NextResponse.json({ ok: true, ignored: payload.type });
  }

  const paymentData = payload.data?.payment;
  const orderData = payload.data?.order;
  const cfOrderId = orderData?.order_id || paymentData?.order_id;
  const cfPaymentId = paymentData?.cf_payment_id;
  const paidAmount = paymentData?.payment_amount;

  if (!cfOrderId || !cfPaymentId || !paidAmount) {
    console.error("Webhook: missing expected fields", payload);
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  // 3. Parse our own orderId format: bc_{tournamentId}_{userId}_{timestamp}
  const parts = cfOrderId.split("_");
  if (parts.length !== 4 || parts[0] !== "bc") {
    console.error("Webhook: unrecognized order_id format:", cfOrderId);
    return NextResponse.json({ error: "Unrecognized order id" }, { status: 400 });
  }
  const tournamentId = Number(parts[1]);
  const userId = Number(parts[2]);

  if (!Number.isInteger(tournamentId) || !Number.isInteger(userId)) {
    console.error("Webhook: invalid ids parsed from order_id:", cfOrderId);
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Idempotency: Cashfree can resend the same webhook — never double-create
      const existing = await tx.entryPayment.findFirst({
        where: { paymentGatewayId: cfPaymentId },
      });
      if (existing) {
        return; // already processed, nothing to do
      }

      // Re-fetch tournament INSIDE the transaction to avoid race conditions
      // (e.g. two webhooks landing at the same instant when slots are nearly full)
      const tournament = await tx.tournament.findUnique({
        where: { id: tournamentId },
      });
      if (!tournament) {
        throw new Error(`Tournament ${tournamentId} not found for webhook`);
      }

      // Double-check amount matches what the tournament actually charges —
      // never trust the amount blindly even from a verified webhook
      const expectedFee = Number(tournament.entryFee);
      if (expectedFee && Number(paidAmount) < expectedFee) {
        throw new Error(
          `Paid amount ${paidAmount} is less than expected entry fee ${expectedFee}`
        );
      }

      

      // Payment SUCCESS confirm hone ke baad

const result = await prisma.$transaction(async (tx) => {
  // 1. Check: kya payment already processed hai?
  const existingPayment = await tx.entryPayment.findFirst({
    where: {
      paymentGatewayId: cf_payment_id,
      status: "PAID",
    },
  });

  if (existingPayment) {
    return {
      alreadyProcessed: true,
      matchId: existingPayment.matchId,
    };
  }

  // 2. Match history create
  const matchHistory = await tx.matchHistory.create({
    data: {
      userId: user.id,
      tournamentId: tournament.id,
      game: tournament.game,
      map: tournament.map,
      mode: tournament.mode,
      resultStatus: "UNVERIFIED",
    },
  });

  // 3. Entry payment create + match link
  await tx.entryPayment.create({
    data: {
      userId: user.id,
      tournamentId: tournament.id,
      matchId: matchHistory.id,
      amount: amount,
      paymentGatewayId: cf_payment_id,
      status: "PAID",
      description: `Tournament Entry Fee - ${tournament.title} - ${orderId}`,
    },
  });

  // 4. Joined count increment
  await tx.tournament.update({
    where: {
      id: tournament.id,
    },
    data: {
      joinedCount: {
        increment: 1,
      },
    },
  });

  return {
    alreadyProcessed: false,
    matchId: matchHistory.id,
  };
});
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook: transaction failed", err);
    // Return 500 so Cashfree retries the webhook later
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}