import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function POST(req) {
  try {
    // 1. Admin authentication
    const adminKey = req.headers.get("x-admin-key");

    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // 2. Request data
    const { requestId, action } = await req.json();

    if (!requestId || !action) {
      return NextResponse.json(
        {
          success: false,
          error: "requestId aur action zaroori hai",
        },
        { status: 400 }
      );
    }

    // 3. ID validate
    const parsedId = Number(requestId);

    if (!Number.isInteger(parsedId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid requestId",
        },
        { status: 400 }
      );
    }

    // 4. Withdrawal find karo
    const withdrawal = await prisma.withdrawalRequest.findUnique({
      where: {
        id: parsedId,
      },
      include: {
        user: true,
        tournamentReward: true,
      },
    });

    if (!withdrawal) {
      return NextResponse.json(
        {
          success: false,
          error: "Request not found",
        },
        { status: 404 }
      );
    }

    // 5. Sirf Pending request process hogi
    if (withdrawal.status !== "Pending") {
      return NextResponse.json(
        {
          success: false,
          error: `Ye request already ${withdrawal.status} hai`,
        },
        { status: 400 }
      );
    }

    // =========================
    // APPROVE
    // =========================
    if (action === "APPROVE") {
      const updatedWithdrawal = await prisma.$transaction(async (tx) => {
        // Reward ko PAID mark karo — sirf yahi asli "source of truth" hai
        await tx.tournamentReward.update({
          where: { id: withdrawal.tournamentRewardId },
          data: { status: "PAID" },
        });

        return tx.withdrawalRequest.update({
          where: { id: parsedId },
          data: { status: "Approved" },
        });
      });

      // Database me actual status check karne ke liye
      console.log(
        "WITHDRAWAL APPROVED:",
        updatedWithdrawal.id,
        updatedWithdrawal.status
      );

      await prisma.notification.create({
        data: {
          type: "PERSONAL",
          userId: withdrawal.user.uid,
          title: "💰 Withdrawal Approved!",
          message: `Your withdrawal of ₹${withdrawal.amount} has been sent to your UPI ID (${withdrawal.upiId}). Please check your bank/UPI app.`,
        },
      });

      return NextResponse.json({
        success: true,
        message:
          "Withdrawal approved. Confirm kar lo ki manually paisa UPI pe bhej diya hai.",
        withdrawal: updatedWithdrawal,
      });
    }

    // =========================
    // REJECT
    // =========================
    if (action === "REJECT") {
      // WithdrawalRequest delete karte hain (tournamentRewardId @unique hai) —
      // isse reward apne aap wapas PENDING_PAYOUT slot mein free ho jaata hai,
      // koi manual "refund to wallet" nahi chahiye kyunki wallet hai hi nahi
      await prisma.withdrawalRequest.delete({
        where: { id: parsedId },
      });

      await prisma.notification.create({
        data: {
          type: "PERSONAL",
          userId: withdrawal.user.uid,
          title: "❌ Withdrawal Rejected",
          message: `Your withdrawal request of ₹${withdrawal.amount} was rejected. You can submit a new withdrawal request for this reward.`,
        },
      });

      console.log("WITHDRAWAL REJECTED (request deleted):", parsedId);

      return NextResponse.json({
        success: true,
        message:
          "Withdrawal rejected. Reward ab dobara withdraw ke liye available hai.",
      });
    }

    // =========================
    // INVALID ACTION
    // =========================
    return NextResponse.json(
      {
        success: false,
        error: "Invalid action. APPROVE ya REJECT use karo.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Withdrawal verify error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Something went wrong",
      },
      { status: 500 }
    );
  }
}