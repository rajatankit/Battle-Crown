import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    // Agar token se email nikalna hai to baad mein improve karenge
    // Filhal email query se chalayenge
    if (!email) {
      return NextResponse.json({ success: false, message: "email required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const payments = await prisma.entryPayment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        tournament: {
          select: { title: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error("Entry payments error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}