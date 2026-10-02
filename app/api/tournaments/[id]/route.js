import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";

// Fields an organizer (not admin) is allowed to touch on their own
// user-organized tournament. Crown reward config, maxSlots after
// people have joined, and anything admin-only stays out of this list.
const EDITABLE_FIELDS = [
  "title",
  "map",
  "mode",
  "startTime",
  "roomId",
  "roomPassword",
  "posterUrl",
];

export async function PATCH(req, { params }) {
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

    // OWNERSHIP GATE — server-side, non-negotiable. Organizer can only
    // ever touch a tournament where createdByUserId is their own id.
    if (tournament.organizerType !== "User" || tournament.createdByUserId !== user.id) {
      return NextResponse.json(
        { success: false, message: "You do not have access to this tournament" },
        { status: 403 }
      );
    }

    if (["completed", "cancelled"].includes(tournament.status)) {
      return NextResponse.json(
        { success: false, message: `Cannot edit a ${tournament.status} tournament` },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const data = {};

    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) {
        data[field] = field === "startTime" && body[field] ? new Date(body[field]) : body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, message: "No editable fields provided" }, { status: 400 });
    }

    const updated = await prisma.tournament.update({
      where: { id: tournamentId },
      data,
    });

    return NextResponse.json({ success: true, tournament: updated });
  } catch (error) {
    console.error("Organizer edit tournament error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}