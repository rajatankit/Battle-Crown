import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getVerifiedUid } from "../../../lib/auth";

export async function GET(request) {
  try {
    const uid = await getVerifiedUid(request);
    if (!uid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");
    if (!orderId) {
      return NextResponse.json({ success: false, message: "order_id is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    // ═══════════════════════════════════════════════════════════
    // SUBSCRIPTION ORDERS (sub_...)
    // ═══════════════════════════════════════════════════════════
    if (orderId.startsWith("sub_")) {
      const parts = orderId.split("_");
      const orderUserId = Number(parts[1]);

      if (orderUserId !== user.id) {
        return NextResponse.json(
          { success: false, message: "Order does not belong to this user" },
          { status: 403 }
        );
      }

      let subOrder = await prisma.subscriptionOrder.findFirst({
        where: { cfOrderId: orderId, userId: user.id },
        include: { plan: true },
      });

      if (!subOrder) {
        return NextResponse.json({ success: true, status: "PENDING" });
      }

      // Already PAID
      if (subOrder.status === "PAID") {
        return NextResponse.json({
          success: true,
          status: "PAID",
          type: "subscription",
        });
      }

      if (subOrder.status === "FAILED" || subOrder.status === "CANCELLED") {
        return NextResponse.json({
          success: true,
          status: subOrder.status,
          type: "subscription",
        });
      }

      // PENDING → Cashfree se live status check karo
      const appId = process.env.CASHFREE_APP_ID;
      const secretKey = process.env.CASHFREE_SECRET_KEY;
      const isProd = process.env.CASHFREE_ENV === "production";
      const baseUrl = isProd
        ? "https://api.cashfree.com/pg/orders"
        : "https://sandbox.cashfree.com/pg/orders";

      try {
        const cfRes = await fetch(`\( {baseUrl}/ \){orderId}`, {
          method: "GET",
          headers: {
            "x-client-id": appId,
            "x-client-secret": secretKey,
            "x-api-version": "2023-08-01",
          },
        });

        const cfData = await cfRes.json();
        console.log("Cashfree order status:", cfData);

        const cfStatus = (cfData.order_status || "").toUpperCase();

        // SUCCESS / PAID
        if (cfStatus === "PAID" || cfStatus === "SUCCESS") {
          // 1. Mark order PAID
          subOrder = await prisma.subscriptionOrder.update({
            where: { id: subOrder.id },
            data: { status: "PAID" },
            include: { plan: true },
          });

          // 2. Activate / extend subscription
          const now = new Date();
          const days = subOrder.billingCycle === "annual" ? 365 : 30;
          const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

          // Cancel any existing active sub
          await prisma.userSubscription.updateMany({
            where: { userId: user.id, status: "active" },
            data: { status: "expired" },
          });

          // Create new active subscription
          await prisma.userSubscription.create({
            data: {
              userId: user.id,
              planId: subOrder.planId,
              billingCycle: subOrder.billingCycle,
              status: "active",
              startsAt: now,
              expiresAt,
            },
          });

          console.log(`Subscription activated for user ${user.id}, plan ${subOrder.planId}`);

          return NextResponse.json({
            success: true,
            status: "PAID",
            type: "subscription",
          });
        }

        if (cfStatus === "EXPIRED" || cfStatus === "CANCELLED" || cfStatus === "FAILED") {
          await prisma.subscriptionOrder.update({
            where: { id: subOrder.id },
            data: { status: "FAILED" },
          });
          return NextResponse.json({
            success: true,
            status: "FAILED",
            type: "subscription",
          });
        }
      } catch (cfErr) {
        console.error("Cashfree status fetch error:", cfErr);
      }

      return NextResponse.json({
        success: true,
        status: "PENDING",
        type: "subscription",
      });
    }

    // ═══════════════════════════════════════════════════════════
    // TOURNAMENT ORDERS (bc_...) — purana logic
    // ═══════════════════════════════════════════════════════════
    const parts = orderId.split("_");
    const orderUserId = parts.length === 4 ? Number(parts[2]) : null;

    if (orderUserId !== user.id) {
      return NextResponse.json(
        { success: false, message: "Order does not belong to this user" },
        { status: 403 }
      );
    }

    const payment = await prisma.entryPayment.findFirst({
      where: {
        userId: user.id,
        status: "PAID",
        description: { contains: orderId },
      },
    });

    if (payment) {
      return NextResponse.json({
        success: true,
        status: "PAID",
        type: "tournament",
        payment,
      });
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