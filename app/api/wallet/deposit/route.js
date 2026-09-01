import { NextResponse } from "next/server";
import { logCortexError } from "../../../lib/cortex/errorLogger";

export async function POST(req) {
  try {
    const { email, amount } = await req.json();

    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;

    const orderId = "order_" + Date.now();

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
        customer_details: {
          customer_id: email ? email.replace(/[^a-zA-Z0-9_]/g, "_") : "user_student_1",
          customer_phone: "9999999999",
        },
        order_meta: {
          return_url: `https://battle-crown.vercel.app/dashboard?order_id=${orderId}`,
        },
      }),
    });

    const data = await cashfreeRes.json();

    if (cashfreeRes.ok && data.payment_session_id) {
      return NextResponse.json({
        success: true,
        payment_session_id: data.payment_session_id,
        order_id: orderId,
      });
    } else {
      console.error("Cashfree API Error Response:", data);
      await logCortexError("wallet/deposit", new Error(data.message || "Order creation failed"));
      return NextResponse.json({ success: false, message: data.message || "Order creation failed" }, { status: 500 });
    }
  } catch (error) {
    console.error("Server Error:", error);
    await logCortexError("wallet/deposit", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}