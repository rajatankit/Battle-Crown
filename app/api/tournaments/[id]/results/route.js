import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";

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

    const tournaments = await prisma.tournament.findMany({
      where: { createdByUserId: user.id, organizerType: "User" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        game: true,
        status: true,
        maxSlots: true,
        joinedCount: true,
        startTime: true,
        roomId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, tournaments });
  } catch (error) {
    console.error("GET organized-tournaments error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}