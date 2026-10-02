// app/api/tournaments/sync/route.js
// Firestore ke tournaments ko Postgres me mirror karta hai.
// Ab data client se nahi liya jata, server khud Firestore se padhta hai,
// aur sirf logged-in user hi ise chala sakta hai.

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";
import { adminDb } from "@/app/lib/firebase-admin";

function toDate(value) {
  if (!value) return null;
  const d = value?.toDate ? value.toDate() : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req) {
  try {
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const snapshot = await adminDb.collection("tournaments").get();

    let synced = 0;

    for (const doc of snapshot.docs) {
      const t = doc.data();

      const data = {
        title: t.title || "Untitled Tournament",
        game: t.game || t.gameType || "BGMI",
        map: t.map || null,
        mode: t.mode || null,
        entryFee:
          t.entryFee !== undefined && t.entryFee !== null
            ? String(t.entryFee)
            : null,
        maxSlots: Number(t.maxSlots) || 100,
        joinedCount: Number(t.joinedCount) || 0,
        status: t.status || "upcoming",
        firstPrize: t.firstPrize != null ? Number(t.firstPrize) : 0,
        secondPrize: t.secondPrize != null ? Number(t.secondPrize) : 0,
        thirdPrize: t.thirdPrize != null ? Number(t.thirdPrize) : 0,
        killReward: t.killReward != null ? Number(t.killReward) : 5,
        roomId: t.roomId || null,
        roomPassword: t.roomPassword || null,
        startTime: toDate(t.date),
      };

      await prisma.tournament.upsert({
        where: { firestoreId: doc.id },
        update: data,
        create: { firestoreId: doc.id, ...data },
      });

      synced++;
    }

    return NextResponse.json({ success: true, synced });
  } catch (err) {
    console.error("Tournament sync error:", err);
    return NextResponse.json(
      { success: false, error: "Sync failed" },
      { status: 500 }
    );
  }
}