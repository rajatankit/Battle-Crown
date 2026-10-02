import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";

// GET /api/user/crowns — balance + last 20 transactions for the
// currently authenticated user (matches app/api/user/register,
// app/api/user/match-history convention: no :id in the URL, user
// is resolved from the auth token).
export async function GET(req) {
  try {
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const wallet = await prisma.crownWallet.findUnique({
      where: { userId: user.id },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!wallet) {
      // No wallet yet == 0 balance, no transactions — not an error.
      return NextResponse.json({ success: true, balance: 0, transactions: [] });
    }

    return NextResponse.json({
      success: true,
      balance: wallet.balance,
      transactions: wallet.transactions,
    });
  } catch (error) {
    console.error("GET crowns error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}