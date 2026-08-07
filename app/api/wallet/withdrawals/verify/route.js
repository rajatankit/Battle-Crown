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
      const updatedWithdrawal =
        await prisma.withdrawalRequest.update({
          where: {
            id: parsedId,
          },
          data: {
            status: "Approved",
          },
        });

      // Database me actual status check karne ke liye
      console.log(
        "WITHDRAWAL APPROVED:",
        updatedWithdrawal.id,
        updatedWithdrawal.status
      );

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
      const updatedWithdrawal = await prisma.$transaction(
        async (tx) => {
          // Pehle withdrawal ko Rejected karo
          const updated = await tx.withdrawalRequest.update({
            where: {
              id: parsedId,
            },
            data: {
              status: "Rejected",
            },
          });

          // Amount wallet me refund karo
          await tx.user.update({
            where: {
              id: withdrawal.userId,
            },
            data: {
              winningsWallet: {
                increment: withdrawal.amount,
              },
            },
          });

          return updated;
        }
      );

      console.log(
        "WITHDRAWAL REJECTED:",
        updatedWithdrawal.id,
        updatedWithdrawal.status
      );

      return NextResponse.json({
        success: true,
        message:
          "Withdrawal rejected aur amount user ke wallet me refund ho gaya.",
        withdrawal: updatedWithdrawal,
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