// app/api/tournament/[id]/join/route.js

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getVerifiedUid } from "../../../../lib/auth";
import { logCortexError } from "../../../../lib/cortex/errorLogger";

export async function POST(req, { params }) {
  try {
    const tournamentId = parseInt(params.id);

    // 1. Verify Firebase token — client-sent email par bharosa nahi karte
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { whatsapp, ign, uid: gameUid } = body;

    // 2. User lookup by Firebase uid (token se, body se nahi)
    const user = await prisma.user.findUnique({ where: { uid } });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const email = user.email;

    // 3. Tournament check
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      return NextResponse.json(
        { success: false, message: "Tournament not found" },
        { status: 404 }
      );
    }

    if (tournament.status !== "upcoming") {
      return NextResponse.json(
        { success: false, message: "Registration closed" },
        { status: 400 }
      );
    }

    if (tournament.joinedCount >= tournament.maxSlots) {
      return NextResponse.json(
        { success: false, message: "Tournament is full" },
        { status: 400 }
      );
    }

    // 4. Already joined check — sirf PAID dekhte hain.
    // PENDING/incomplete attempts ko block nahi karte, kyunki wo
    // ab DB mein record hi nahi hote (webhook hi PAID record banata hai).
    const alreadyJoined = await prisma.entryPayment.findFirst({
      where: {
        userId: user.id,
        tournamentId,
        status: "PAID",
      },
    });

    if (alreadyJoined) {
      return NextResponse.json(
        { success: false, message: "Already joined this tournament" },
        { status: 400 }
      );
    }

    const amount = parseFloat(tournament.entryFee || "0");
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid entry fee" },
        { status: 400 }
      );
    }

    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;

    // IMPORTANT: format must match what the webhook expects to parse:
    // bc_{tournamentId}_{userId}_{timestamp} — lowercase "bc", no T/U prefixes
    const orderId = `bc_${tournamentId}_${user.id}_${Date.now()}`;
    const description = `Tournament Entry Fee - ${tournament.title} - ${tournament.id}`;

    // Cashfree order create
    const cashfreeRes = await fetch("https://sandbox.cashfree.com/pg/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": appId,
        "x-client-secret": secretKey,
        "x-api-version": "2023-08-01",
      },
      body: JSON.stringify({
        order_amount: amount,
        order_currency: "INR",
        order_id: orderId,
        order_note: description,
        customer_details: {
          customer_id: email.replace(/[^a-zA-Z0-9_]/g, "_"),
          customer_email: email,
          customer_phone: whatsapp || "9999999999",
        },
        order_meta: {
          return_url: `https://battle-crown.vercel.app/dashboard?order_id=${orderId}&tournament_id=${tournamentId}`,
        },
      }),
    });

    const data = await cashfreeRes.json();

    if (!cashfreeRes.ok || !data.payment_session_id) {
      console.error("Cashfree Error:", data);
      await logCortexError("tournament/[id]/join", new Error(data.message || "Order failed"));
      return NextResponse.json(
        { success: false, message: data.message || "Order creation failed" },
        { status: 500 }
      );
    }

    // NOTE: koi EntryPayment record yahan nahi banate. Source of truth
    // sirf webhook hai (app/api/webhooks/cashfree/route.js), jo payment
    // confirm hone par seedha PAID record banata hai — idempotent hai
    // (cfPaymentId se duplicate-safe), aur race-condition-safe hai
    // (joinedCount transaction ke andar increment hota hai).

    // Join form ke ign/uid se user ka game profile update kar dete hain
    if (ign || gameUid) {
      const game = (tournament.game || "").toLowerCase();
      const isFreeFire = game.includes("free");
      await prisma.user.update({
        where: { id: user.id },
        data: isFreeFire
          ? { ffIgn: ign || user.ffIgn, ffUid: gameUid || user.ffUid }
          : { bgmiIgn: ign || user.bgmiIgn, bgmiUid: gameUid || user.bgmiUid },
      });
    }

    return NextResponse.json({
      success: true,
      payment_session_id: data.payment_session_id,
      order_id: orderId,
    });
  } catch (error) {
    console.error("Join Tournament Error:", error);
    await logCortexError("tournament/[id]/join", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}