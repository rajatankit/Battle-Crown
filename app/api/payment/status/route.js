import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getVerifiedUid } from "../../../lib/auth";

// GET /api/payment/status?order_id=bc_12_34_1234567890
//
// The webhook (app/api/webhooks/cashfree/route.js) is what actually
// confirms payment and creates the EntryPayment row — this route just
// checks whether that's happened yet, for the post-redirect UI to poll.
// It does NOT verify payment itself and never writes anything.
export async function GET(request) {
  try {
    const uid = await getVerifiedUid(request);
    if (!uid) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");
    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "order_id is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // orderId format: bc_{tournamentId}_{userId}_{timestamp}
    const parts = orderId.split("_");
    const orderUserId = parts.length === 4 ? Number(parts[2]) : null;
    if (orderUserId !== user.id) {
      return NextResponse.json(
        { success: false, message: "Order does not belong to this user" },
        { status: 403 }
      );
    }

    // Find any EntryPayment for this tournament created around the same
    // order — matched via description containing the orderId (set by the
    // webhook), since paymentGatewayId is Cashfree's own id, not ours.
    const payment = await prisma.entryPayment.findFirst({
      where: {
        userId: user.id,
        status: "PAID",
        description: { contains: orderId },
      },
    });

    if (payment) {
      return NextResponse.json({ success: true, status: "PAID", payment });
    }

    return NextResponse.json({ success: true, status: "PENDING" });
  } catch (error) {
    console.error("Payment status check error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to check payment status" },
      { status: 500 }
    );
  }
}