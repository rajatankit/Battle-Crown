import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function POST(req) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { requestId, action } = await req.json();
    if (!requestId || !action) {
      return NextResponse.json(
        { success: false, error: "requestId aur action zaroori hai" },
        { status: 400 }
      );
    }

    const parsedId = Number(requestId);
    const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id: parsedId } });

    if (!withdrawal) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    // Duplicate processing se bachne ke liye — sirf Pending hi process ho sakti hai
    if (withdrawal.status !== "Pending") {
      return NextResponse.json(
        { success: false, error: `Ye request already ${withdrawal.status} hai` },
        { status: 400 }
      );
    }

    if (action === "APPROVE") {
      // Amount already wallet se kat chuka tha jab request bani thi.
      // Admin ne manually UPI pe paisa bhej diya — bas status update karo.
      await prisma.withdrawalRequest.update({
        where: { id: parsedId },
        data: { status: "Approved" },
      });
      return NextResponse.json({
        success: true,
        message: "Withdrawal approved. Confirm kar lo ki manually paisa UPI pe bhej diya hai.",
      });
    }

    if (action === "REJECT") {
      // Reject karne pe amount wapas winning wallet me refund karo
      await prisma.$transaction([
        prisma.withdrawalRequest.update({
          where: { id: parsedId },
          data: { status: "Rejected" },
        }),
        prisma.user.update({
          where: { id: withdrawal.userId },
          data: { winningsWallet: { increment: withdrawal.amount } },
        }),
      ]);
      return NextResponse.json({
        success: true,
        message: "Withdrawal rejected aur amount user ke wallet me refund ho gaya.",
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Withdrawal verify error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}