import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";

export async function POST(req, { params }) {
  try {
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const resolvedParams = await Promise.resolve(params);
    const tournamentId = Number(resolvedParams.id);
    if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
      return NextResponse.json({ success: false, message: "Invalid tournament id" }, { status: 400 });
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      return NextResponse.json({ success: false, message: "Tournament not found" }, { status: 404 });
    }

    // OWNERSHIP GATE
    if (tournament.organizerType !== "User" || tournament.createdByUserId !== user.id) {
      return NextResponse.json(
        { success: false, message: "You do not have access to this tournament" },
        { status: 403 }
      );
    }

    if (["completed", "cancelled"].includes(tournament.status)) {
      return NextResponse.json(
        { success: false, message: `Tournament is already ${tournament.status}` },
        { status: 400 }
      );
    }

    // NOTE: no automatic crown refund on cancel. If you want to refund
    // the crownOrganizeCost when a crown-funded tournament is cancelled
    // before anyone joins, that needs an explicit CrownTransaction
    // (type "refund_organize_tournament") in a $transaction here — left
    // out for now since the spec doesn't define a refund policy.
    const updated = await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "cancelled" },
    });

    return NextResponse.json({ success: true, message: "Tournament cancelled", tournament: updated });
  } catch (error) {
    console.error("Organizer cancel tournament error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}