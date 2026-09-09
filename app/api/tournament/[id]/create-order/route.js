// app/api/tournaments/[id]/create-order/route.js
//
// Player hits "Join" -> this route creates a Cashfree order.
// IMPORTANT: this route does NOT create the tournament registration/join.
// Registration only happens in the webhook, after Cashfree confirms payment.
// Never trust a client-side "payment succeeded" signal.
//
// Adjust the prisma import to match your actual project path:
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/verify-auth"; // returns Firebase uid string, or null

import { createCashfreeOrder } from "@/app/lib/cashfree";
import { NextResponse } from "next/server";

export async function POST(req, { params }) {
  try {
    // 1. Authenticate the caller — this only gives us the Firebase uid,
    //    so we still have to load our own User row from it.
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authedUser = await prisma.user.findUnique({ where: { uid } });
    if (!authedUser) {
      return NextResponse.json(
        { error: "User profile not found — complete signup first" },
        { status: 404 }
      );
    }

    // Cashfree requires a phone number to create an order. Your User model
    // currently has no `phone` field, so the client must send one — e.g. the
    // number captured during profile setup. Swap this for authedUser.phone
    // once you add that column.
    const body = await req.json().catch(() => ({}));
    const customerPhone = body?.phone;
    if (!customerPhone || !/^\d{10}$/.test(customerPhone)) {
      return NextResponse.json(
        { error: "Valid 10-digit phone number is required to create the payment order" },
        { status: 400 }
      );
    }

    const tournamentId = Number(params.id);
    if (!Number.isInteger(tournamentId)) {
      return NextResponse.json({ error: "Invalid tournament id" }, { status: 400 });
    }

    // 2. Load tournament — never trust entryFee from the client/frontend
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (tournament.status !== "upcoming") {
      return NextResponse.json(
        { error: "Registration is not open for this tournament" },
        { status: 409 }
      );
    }
    if (tournament.joinedCount >= tournament.maxSlots) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 409 });
    }

    const entryFee = Number(tournament.entryFee);
    if (!entryFee || entryFee <= 0) {
      return NextResponse.json(
        { error: "This tournament has no valid entry fee configured" },
        { status: 400 }
      );
    }

    // 3. Block duplicate joins — one PAID entry per user per tournament
    const existingPaid = await prisma.entryPayment.findFirst({
      where: {
        userId: authedUser.id,
        tournamentId: tournament.id,
        status: "PAID",
      },
    });
    if (existingPaid) {
      return NextResponse.json(
        { error: "You have already joined this tournament" },
        { status: 409 }
      );
    }

    // 4. Create a fresh Cashfree order
    //    orderId encodes tournamentId + userId so the webhook can parse it back out.
    const orderId = `bc_${tournament.id}_${authedUser.id}_${Date.now()}`;

    const cfOrder = await createCashfreeOrder({
      orderId,
      amount: entryFee,
      customerId: authedUser.id,
      customerPhone,
      customerEmail: authedUser.email,
    });

    return NextResponse.json({
      orderId: cfOrder.order_id,
      paymentSessionId: cfOrder.payment_session_id,
    });
  } catch (err) {
    console.error("create-order error:", err);
    return NextResponse.json(
      { error: "Failed to create payment order" },
      { status: 500 }
    );
  }
}