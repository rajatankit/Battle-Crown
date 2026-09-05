import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { prisma } from "../../../../lib/prisma";

export async function POST(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    return NextResponse.json(
      { success: false, error: "title is required." },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.tournament.findFirst({
      where: { title: { contains: title, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firestoreId: true,
        title: true,
        game: true,
        status: true,
      },
    });

    if (!row || !row.firestoreId) {
      return NextResponse.json(
        {
          success: false,
          error: "Tournament not found or has no Firestore link.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      tournament: {
        tournamentId: row.id,
        firestoreId: row.firestoreId,
        title: row.title,
        game: row.game,
        status: row.status,
      },
    });
  } catch (error) {
    console.error("Find tournament error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Lookup failed.",
      },
      { status: 500 }
    );
  }
}