// app/api/webhooks/cashfree/route.js

import { prisma } from "@/app/lib/prisma";
import { verifyCashfreeSignature } from "@/app/lib/cashfree";
import { NextResponse } from "next/server";
import { logCortexError } from "@/app/lib/cortex/errorLogger";
import { adminDb } from "@/app/lib/firebase-admin";

export async function POST(req) {
  let rawBody;

  // ─────────────────────────────────────────────
  // 1. Read RAW body
  // ─────────────────────────────────────────────
  try {
    rawBody = await req.text();
  } catch (err) {
    console.error("Webhook: failed to read body", err);

    return NextResponse.json(
      { error: "Bad request" },
      { status: 400 }
    );
  }

  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");

  // ─────────────────────────────────────────────
  // 2. Verify Cashfree signature FIRST
  // ─────────────────────────────────────────────
  let isValid = false;

  try {
    isValid = verifyCashfreeSignature(
      rawBody,
      signature,
      timestamp
    );
  } catch (err) {
    console.error(
      "Webhook: signature verification error",
      err
    );

    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }

  if (!isValid) {
    console.warn(
      "Webhook: invalid signature — possible spoofed request"
    );

    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // ─────────────────────────────────────────────
  // 3. Parse JSON AFTER signature verification
  // ─────────────────────────────────────────────
  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Webhook: invalid JSON", err);

    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  // ─────────────────────────────────────────────
  // 4. Only process successful payment webhook
  // ─────────────────────────────────────────────
  if (payload.type !== "PAYMENT_SUCCESS_WEBHOOK") {
    return NextResponse.json({
      ok: true,
      ignored: payload.type,
    });
  }

  const paymentData = payload.data?.payment;
  const orderData = payload.data?.order;

  const cfOrderId =
    orderData?.order_id ||
    paymentData?.order_id;

  const cfPaymentId =
    paymentData?.cf_payment_id;

  const paidAmount =
    paymentData?.payment_amount;

  // ─────────────────────────────────────────────
  // 5. Validate required Cashfree fields
  // ─────────────────────────────────────────────
  if (
    !cfOrderId ||
    !cfPaymentId ||
    paidAmount === undefined ||
    paidAmount === null
  ) {
    console.error(
      "Webhook: missing expected fields",
      payload
    );

    return NextResponse.json(
      { error: "Malformed payload" },
      { status: 400 }
    );
  }

  // ─────────────────────────────────────────────
  // 6. Parse our order ID
  //
  // bc_{tournamentId}_{userId}_{timestamp}
  // ─────────────────────────────────────────────
  const parts = cfOrderId.split("_");

  if (
    parts.length !== 4 ||
    parts[0] !== "bc"
  ) {
    console.error(
      "Webhook: unrecognized order_id:",
      cfOrderId
    );

    return NextResponse.json(
      { error: "Unrecognized order id" },
      { status: 400 }
    );
  }

  const tournamentId = Number(parts[1]);
  const userId = Number(parts[2]);

  if (
    !Number.isInteger(tournamentId) ||
    !Number.isInteger(userId)
  ) {
    console.error(
      "Webhook: invalid IDs:",
      cfOrderId
    );

    return NextResponse.json(
      { error: "Invalid order id" },
      { status: 400 }
    );
  }

  // ─────────────────────────────────────────────
  // 7. DATABASE TRANSACTION
  // ─────────────────────────────────────────────
  try {
    await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.entryPayment.findFirst({
        where: { paymentGatewayId: cfPaymentId },
      });

      if (existingPayment) {
        console.log("Webhook already processed:", cfPaymentId);
        return;
      }

      const tournament = await tx.tournament.findUnique({
        where: { id: tournamentId },
      });

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
          userId: userId,
          tournamentId: tournamentId,
          game: tournament.game,
          map: tournament.map,
          mode: tournament.mode,
          resultStatus: "UNVERIFIED",
        },
      });

      console.log("MatchHistory created:", matchHistory.id);

      await tx.entryPayment.create({
        data: {
          userId: userId,
          tournamentId: tournamentId,
          matchId: matchHistory.id,
          amount: actualPaidAmount,
          paymentGatewayId: cfPaymentId,
          status: "PAID",
          description: `Tournament Entry Fee - ${tournament.title} - ${cfOrderId}`,
        },
      });

      console.log("EntryPayment created:", cfPaymentId);

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { joinedCount: { increment: 1 } },
      });

      console.log(`Tournament ${tournamentId} joinedCount incremented`);

      // Also sync joinedCount to Firestore (frontend reads from here)
      if (tournament.firestoreId) {
        try {
          await adminDb
            .collection("tournaments")
            .doc(tournament.firestoreId)
            .update({
              joinedCount: tournament.joinedCount + 1,
            });
          console.log(`Firestore joinedCount synced for ${tournament.firestoreId}`);
        } catch (fsErr) {
          console.error("Firestore joinedCount sync failed:", fsErr);
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook: transaction failed:", err);
    await logCortexError("webhooks/cashfree", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}