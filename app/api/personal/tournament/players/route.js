import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function POST(req) {
  try {
    const { tournamentId } = await req.json();

    if (!tournamentId) {
      return NextResponse.json(
        { success: false, error: "tournamentId required" },
        { status: 400 }
      );
    }

    const entries = await prisma.matchHistory.findMany({
      where: { tournamentId },
      select: { ign: true, uid: true, whatsapp_number: true },
      distinct: ["userId"],
    });

    return NextResponse.json({ success: true, players: entries });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}