// app/api/webhooks/cashfree/route.js

import { prisma } from "@/app/lib/prisma";
import { verifyCashfreeSignature } from "@/app/lib/cashfree";
import { NextResponse } from "next/server";
import { logCortexError } from "@/app/lib/cortex/errorLogger";
import { adminDb } from "@/app/lib/firebase-admin";

function addInterval(date, billingCycle) {
  const d = new Date(date);
  if (billingCycle === "annual") {
    d.setMonth(d.getMonth() + 12);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

export async function POST(req) {
  let rawBody;

  // 1. Read RAW body
  try {
    rawBody = await req.text();
  } catch (err) {
    console.error("Webhook: failed to read body", err);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");

  // 2. Verify Cashfree signature FIRST — compulsory, no exceptions
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

  // 3. Parse JSON AFTER signature verification
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Webhook: invalid JSON", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 4. Only process successful payment webhook
  if (payload.type !== "PAYMENT_SUCCESS_WEBHOOK") {
    return NextResponse.json({ ok: true, ignored: payload.type });
  }

  const paymentData = payload.data?.payment;
  const orderData = payload.data?.order;

  const cfOrderId = orderData?.order_id || paymentData?.order_id;
  const cfPaymentId = paymentData?.cf_payment_id;
  const paidAmount = paymentData?.payment_amount;

  // 5. Validate required Cashfree fields
  if (!cfOrderId || !cfPaymentId || paidAmount === undefined || paidAmount === null) {
    console.error("Webhook: missing expected fields", payload);
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  // 6. Route by order-id prefix
  if (cfOrderId.startsWith("sub_")) {
    return handleSubscriptionPayment({ cfOrderId, cfPaymentId, paidAmount });
  }

  if (cfOrderId.startsWith("bc_")) {
    // Legacy tournament entry-fee flow. Tournaments are free now (crown
    // model), so no new "bc_" orders are created going forward — this
    // branch only exists to safely no-op/process any in-flight legacy
    // orders and is otherwise dead code.
    return handleLegacyEntryPayment({ cfOrderId, cfPaymentId, paidAmount });
  }

  console.error("Webhook: unrecognized order_id prefix:", cfOrderId);
  return NextResponse.json({ error: "Unrecognized order id" }, { status: 400 });
}

// ============================================================
// SUBSCRIPTION PAYMENT — activate / extend UserSubscription
// ============================================================
async function handleSubscriptionPayment({ cfOrderId, cfPaymentId, paidAmount }) {
  try {
    await prisma.$transaction(async (tx) => {
      // IDEMPOTENCY: cfPaymentId is unique on SubscriptionOrder. If a row
      // already has this cfPaymentId, we've already processed this exact
      // payment — duplicate webhook delivery is a safe no-op.
      const alreadyProcessed = await tx.subscriptionOrder.findFirst({
        where: { cfPaymentId },
      });
      if (alreadyProcessed) {
        console.log("Subscription webhook already processed:", cfPaymentId);
        return;
      }

      const order = await tx.subscriptionOrder.findUnique({
        where: { cfOrderId },
        include: { plan: true },
      });

      if (!order) {
        throw new Error(`SubscriptionOrder ${cfOrderId} not found`);
      }

      if (order.status === "PAID") {
        console.log("Subscription order already marked PAID:", cfOrderId);
        return;
      }

      const expectedRupees = order.amountPaisa / 100;
      const actualPaidAmount = Number(paidAmount);

      if (!Number.isFinite(actualPaidAmount)) {
        throw new Error(`Invalid paid amount: ${paidAmount}`);
      }
      if (actualPaidAmount !== expectedRupees) {
        throw new Error(
          `Payment amount mismatch. Expected ${expectedRupees}, received ${actualPaidAmount}`
        );
      }

      await tx.subscriptionOrder.update({
        where: { id: order.id },
        data: { status: "PAID", cfPaymentId },
      });

      // Extend an existing active subscription to the SAME plan from its
      // current expiry; otherwise (no sub, expired, or plan change) start
      // fresh from now.
      const existing = await tx.userSubscription.findFirst({
        where: { userId: order.userId, status: "active" },
        orderBy: { expiresAt: "desc" },
      });

      const now = new Date();
      let startsAt = now;
      if (existing && existing.planId === order.planId && existing.expiresAt > now) {
        startsAt = existing.expiresAt;
      } else if (existing) {
        // Plan changed or old sub already lapsed — close out the old row.
        await tx.userSubscription.update({
          where: { id: existing.id },
          data: { status: "cancelled" },
        });
      }

      const expiresAt = addInterval(startsAt, order.billingCycle);

      await tx.userSubscription.create({
        data: {
          userId: order.userId,
          planId: order.planId,
          status: "active",
          billingCycle: order.billingCycle,
          startsAt: now,
          expiresAt,
        },
      });

      console.log(`Subscription activated for user ${order.userId}, plan ${order.plan.name}, expires ${expiresAt}`);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Subscription webhook: transaction failed:", err);
    await logCortexError("webhooks/cashfree:subscription", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

// ============================================================
// LEGACY ENTRY PAYMENT — kept for any orders already in flight
// from before the free-tournament pivot. No new rows expected.
// ============================================================
async function handleLegacyEntryPayment({ cfOrderId, cfPaymentId, paidAmount }) {
  const parts = cfOrderId.split("_");
  if (parts.length !== 4 || parts[0] !== "bc") {
    console.error("Webhook: unrecognized order_id:", cfOrderId);
    return NextResponse.json({ error: "Unrecognized order id" }, { status: 400 });
  }

  const tournamentId = Number(parts[1]);
  const userId = Number(parts[2]);
  if (!Number.isInteger(tournamentId) || !Number.isInteger(userId)) {
    console.error("Webhook: invalid IDs:", cfOrderId);
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.entryPayment.findFirst({
        where: { paymentGatewayId: cfPaymentId },
      });
      if (existingPayment) {
        console.log("Webhook already processed:", cfPaymentId);
        return;
      }

      const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
      if (!tournament) {
        throw new Error(`Tournament ${tournamentId} not found`);
      }

      const expectedFee = Number(tournament.entryFee);
      const actualPaidAmount = Number(paidAmount);
      if (!Number.isFinite(actualPaidAmount)) {
        throw new Error(`Invalid paid amount: ${paidAmount}`);
      }
      if (actualPaidAmount !== expectedFee) {
        throw new Error(
          `Payment amount mismatch. Expected ${expectedFee}, received ${actualPaidAmount}`
        );
      }

      const matchHistory = await tx.matchHistory.create({
        data: {
          userId,
          tournamentId,
          game: tournament.game,
          map: tournament.map,
          mode: tournament.mode,
          resultStatus: "UNVERIFIED",
        },
      });

      await tx.entryPayment.create({
        data: {
          userId,
          tournamentId,
          matchId: matchHistory.id,
          amount: actualPaidAmount,
          paymentGatewayId: cfPaymentId,
          status: "PAID",
          description: `Tournament Entry Fee - ${tournament.title} - ${cfOrderId}`,
        },
      });

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { joinedCount: { increment: 1 } },
      });

      if (tournament.firestoreId) {
        try {
          await adminDb
            .collection("tournaments")
            .doc(tournament.firestoreId)
            .update({ joinedCount: tournament.joinedCount + 1 });
        } catch (fsErr) {
          console.error("Firestore joinedCount sync failed:", fsErr);
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Legacy entry-payment webhook: transaction failed:", err);
    await logCortexError("webhooks/cashfree:legacy", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}