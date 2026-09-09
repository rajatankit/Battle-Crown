import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { adminAuth } from "../../../lib/firebase-admin";

export async function GET(req) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!idToken) {
      return NextResponse.json({ success: false, message: "Missing auth token" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (err) {
      return NextResponse.json({ success: false, message: "Invalid or expired token" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("order_id");

    if (!orderId) {
      return NextResponse.json({ success: false, message: "order_id required" }, { status: 400 });
    }

    const payment = await prisma.entryPayment.findFirst({
      where: { paymentGatewayId: orderId },
      include: { user: true },
    });

    if (!payment) {
      return NextResponse.json({ success: false, message: "Payment record not found" }, { status: 404 });
    }

    if (payment.user.uid !== decoded.uid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      status: payment.status, // PENDING | PAID | FAILED | REFUNDED
      orderId: payment.paymentGatewayId,
      tournamentId: payment.tournamentId,
    });
  } catch (error) {
    console.error("Payment status check error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}