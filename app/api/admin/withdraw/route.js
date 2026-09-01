import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { logCortexError } from "../../../lib/cortex/errorLogger";

const prisma = new PrismaClient();

export async function GET(req) {
  try {
    const adminKey = req.headers.get("x-admin-key");

    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const requests = await prisma.withdrawalRequest.findMany({
      where: {
        status: "Pending",
      },
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error(error);
    await logCortexError("admin/withdraw", error);

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}