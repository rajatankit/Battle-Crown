import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { logCortexError } from "../../../lib/cortex/errorLogger";

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const { orderId } = await req.json();

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

    if (payment.status === "PAID") {
      return NextResponse.json({
        success: true,
        message: "Already processed",
      });
    }

    // Status update + joinedCount increase
    await prisma.$transaction([
      prisma.entryPayment.update({
        where: { id: payment.id },
        data: { status: "PAID" },
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
      message: "Payment verified & tournament joined successfully",
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