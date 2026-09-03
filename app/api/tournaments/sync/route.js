import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across hot-reloads/requests — avoids
// the connection-exhaustion issue you already fixed elsewhere. If your
// project already has a shared client (e.g. `lib/prisma.js`), import that
// instead of this local one:
//
//   import prisma from "../../../lib/prisma";
//
// and delete the block below.
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// POST /api/tournaments/sync
// Body: { tournaments: [ { id, title, game, map, mode, entryFee, maxSlots,
//                           joinedCount, status, firstPrize, secondPrize,
//                           thirdPrize, killReward, roomId, roomPassword,
//                           date } , ... ] }
//
// Called from the dashboard's Firestore onSnapshot listener every time the
// live tournament list changes, so the Postgres `tournaments` table stays
// mirrored with whatever you create/edit in the Firebase console.
export async function POST(req) {
  try {
    const body = await req.json();
    const tournaments = body?.tournaments;

    if (!Array.isArray(tournaments)) {
      return NextResponse.json(
        { success: false, error: "tournaments must be an array" },
        { status: 400 }
      );
    }

    let synced = 0;

    for (const t of tournaments) {
      if (!t?.id) continue; // skip anything without a Firestore doc id

      const data = {
        title: t.title || "Untitled Tournament",
        game: t.game || t.gameType || "BGMI",
        map: t.map || null,
        mode: t.mode || null,
        entryFee: t.entryFee !== undefined && t.entryFee !== null ? String(t.entryFee) : null,
        maxSlots: Number(t.maxSlots) || 100,
        joinedCount: Number(t.joinedCount) || 0,
        status: t.status || "upcoming",
        firstPrize: t.firstPrize != null ? Number(t.firstPrize) : 0,
        secondPrize: t.secondPrize != null ? Number(t.secondPrize) : 0,
        thirdPrize: t.thirdPrize != null ? Number(t.thirdPrize) : 0,
        killReward: t.killReward != null ? Number(t.killReward) : 5,
        roomId: t.roomId || null,
        roomPassword: t.roomPassword || null,
        startTime: t.date ? new Date(t.date) : null,
      };

      await prisma.tournament.upsert({
        where: { firestoreId: t.id },
        update: data,
        create: { firestoreId: t.id, ...data },
      });

      synced++;
    }

    return NextResponse.json({ success: true, synced });
  } catch (err) {
    console.error("Tournament sync error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}