import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      where: { status: { not: "completed" } },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        firestoreId: true,
        title: true,
        game: true,
        startTime: true,
        joinedCount: true,
      },
    });

    return NextResponse.json({ success: true, tournaments });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}