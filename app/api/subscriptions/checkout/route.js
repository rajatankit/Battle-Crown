import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";
import { logCortexError } from "@/app/lib/cortex/errorLogger";

const VALID_PLANS = ["upgrade", "pro", "promax"];
const VALID_CYCLES = ["monthly", "annual"];

export async function POST(req) {
  try {
    // 1. Auth
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { plan, billingCycle } = body;

    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json(
        { success: false, message: `plan must be one of: ${VALID_PLANS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!VALID_CYCLES.includes(billingCycle)) {
      return NextResponse.json(
        { success: false, message: `billingCycle must be one of: ${VALID_CYCLES.join(", ")}` },
        { status: 400 }
      );
    }

    const planRow = await prisma.subscriptionPlan.findUnique({ where: { name: plan } });
    if (!planRow || !planRow.active) {
      return NextResponse.json({ success: false, message: "Plan not available" }, { status: 404 });
    }

    const amountPaisa =
      billingCycle === "monthly" ? planRow.priceMonthlyPaisa : planRow.priceAnnualPaisa;
    const amountRupees = amountPaisa / 100;

    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    if (!appId || !secretKey) {
      return NextResponse.json(
        { success: false, message: "Payment gateway not configured" },
        { status: 500 }
      );
    }

    // "sub_" prefix lets the shared webhook tell this apart from a
    // tournament entry order ("bc_"). Format: sub_{userId}_{planId}_{cycle}_{ts}
    const orderId = `sub_${user.id}_${planRow.id}_${billingCycle}_${Date.now()}`;
    const description = `Subscription - ${planRow.name} (${billingCycle}) - ${user.id}`;

    const cashfreeRes = await fetch("https://sandbox.cashfree.com/pg/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-client-id": process.env.CASHFREE_APP_ID,
    "x-client-secret": process.env.CASHFREE_SECRET_KEY,
    "x-api-version": "2023-08-01",
  },
      body: JSON.stringify({
        order_amount: amountRupees,
        order_currency: "INR",
        order_id: orderId,
        order_note: description,
        customer_details: {
          customer_id: user.email.replace(/[^a-zA-Z0-9_]/g, "_"),
          customer_email: user.email,
          customer_phone: "9999999999",
        },
        order_meta: {
  return_url: `http://localhost:3000/dashboard?order_id=${orderId}`,
},
      }),
    });

    const data = await cashfreeRes.json();

    if (!cashfreeRes.ok || !data.payment_session_id) {
      console.error("Cashfree subscription order error:", data);
      await logCortexError("subscriptions/checkout", new Error(data.message || "Order failed"));
      return NextResponse.json(
        { success: false, message: data.message || "Order creation failed" },
        { status: 500 }
      );
    }

    // Pending order row — webhook flips this to PAID and is the only
    // thing allowed to activate/extend the subscription.
    await prisma.subscriptionOrder.create({
      data: {
        userId: user.id,
        planId: planRow.id,
        billingCycle,
        amountPaisa,
        cfOrderId: orderId,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      payment_session_id: data.payment_session_id,
      order_id: orderId,
      amount: amountRupees,
    });
  } catch (error) {
    console.error("Subscription checkout error:", error);
    await logCortexError("subscriptions/checkout", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}