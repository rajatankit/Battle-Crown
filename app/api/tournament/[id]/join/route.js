import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getVerifiedUid } from "../../../../lib/auth";
import { logCortexError } from "../../../../lib/cortex/errorLogger";

export async function POST(req, { params }) {
  try {
    // Next.js 15+ / Turbopack mein params Promise ho sakta hai
    const resolvedParams = await Promise.resolve(params);
    const idParam = resolvedParams?.id;

    if (!idParam) {
      return NextResponse.json(
        { success: false, message: "Tournament ID is required" },
        { status: 400 }
      );
    }

    // 1. Auth — Firebase token se uid
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { whatsapp, ign, uid: gameUid } = body;

    // 2. User lookup
    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const email = user.email;

    // 3. Tournament resolve — number id YA firestoreId dono support
    let tournament = null;

    const numericId = parseInt(idParam, 10);

    if (!isNaN(numericId) && String(numericId) === String(idParam).trim()) {
      // Pure number hai
      tournament = await prisma.tournament.findUnique({
        where: { id: numericId },
      });
    }

    if (!tournament) {
      // Firestore ID se try karo
      tournament = await prisma.tournament.findUnique({
        where: { firestoreId: String(idParam) },
      });
    }

    if (!tournament) {
      return NextResponse.json(
        { success: false, message: "Tournament not found" },
        { status: 404 }
      );
    }

    const tournamentId = tournament.id; // Ab hamesha valid Prisma id

    // 4. Status & slots check
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

    // 5. Already joined (sirf PAID)
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

    if (!appId || !secretKey) {
      return NextResponse.json(
        { success: false, message: "Payment gateway not configured" },
        { status: 500 }
      );
    }

    // orderId format — webhook ke saath match kare
    const orderId = "bc_" + String(tournamentId) + "_" + String(user.id) + "_" + Date.now();
const description = "Tournament Entry Fee - " + tournament.title + " - " + tournament.id;

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
      return_url: "https://battle-crown.vercel.app/dashboard?order_id=" + orderId + "&tournament_id=" + tournamentId,
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

    // 7. Game profile update (optional)
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


    // PENDING EntryPayment record banao
await prisma.entryPayment.create({
  data: {
    userId: user.id,
    tournamentId: tournamentId,
    amount: amount,
    paymentGatewayId: orderId,
    status: "PENDING",
    description: description,
  },
});

    // Note: EntryPayment record webhook banayega (source of truth)

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