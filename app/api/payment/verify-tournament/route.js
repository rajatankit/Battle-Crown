import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { logCortexError } from "../../../lib/cortex/errorLogger";

// Cashfree test / health check
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    // Cashfree webhook + frontend dono formats support
    const orderId =
      body.orderId ||
      body.order_id ||
      body.data?.order?.order_id ||
      body.data?.payment?.order_id;

    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "orderId required" },
        { status: 400 }
      );
    }

    const payment = await prisma.entryPayment.findFirst({
      where: { paymentGatewayId: orderId },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, message: "Payment record not found" },
        { status: 404 }
      );
    }

    // Already processed — idempotent
    if (payment.status === "PAID") {
      return NextResponse.json({
        success: true,
        message: "Already processed",
        status: "PAID",
      });
    }

    // MatchHistory create / find
    let match = await prisma.matchHistory.findFirst({
      where: {
        userId: payment.userId,
        tournamentId: payment.tournamentId,
      },
    });

    if (!match) {
      match = await prisma.matchHistory.create({
        data: {
          userId: payment.userId,
          tournamentId: payment.tournamentId,
          resultStatus: "UNVERIFIED",
        },
      });
    }

    // Transaction: PAID + link match + joinedCount
    await prisma.$transaction([
      prisma.entryPayment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          matchId: match.id,
        },
      }),
      prisma.tournament.update({
        where: { id: payment.tournamentId },
        data: {
          joinedCount: { increment: 1 },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Payment verified & tournament joined",
      status: "PAID",
      matchId: match.id,
    });
  } catch (error) {
    console.error("Verify tournament payment error:", error);
    await logCortexError("payment/verify-tournament", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}