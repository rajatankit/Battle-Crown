// app/api/tournaments/sync/route.js
// Firestore ke tournaments ko Postgres me mirror karta hai.
// Server khud Firestore se padhta hai; sirf logged-in user hi chala sakta hai.
//
// NEW: jo tournament Firestore se delete ho chuka hai lekin Postgres me
// abhi bhi hai, use hard-delete nahi karte (payment/crown history ke
// FK RESTRICT se crash ho jata) — balki status "cancelled" kar dete hain.
// Isse woh live/upcoming listings se khud gayab ho jata hai, aur purana
// reward/payment data bhi safe rehta hai.

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
    const activeFirestoreIds = [];

    for (const doc of snapshot.docs) {
      const t = doc.data();
      activeFirestoreIds.push(doc.id);

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
        // lowercased so it always matches the exact-case checks used
        // everywhere else (join route, TournamentCard, BattlesTab filters)
        status: (t.status || "upcoming").toLowerCase(),
        firstPrize: t.firstPrize != null ? Number(t.firstPrize) : 0,
        secondPrize: t.secondPrize != null ? Number(t.secondPrize) : 0,
        thirdPrize: t.thirdPrize != null ? Number(t.thirdPrize) : 0,
        killReward: t.killReward != null ? Number(t.killReward) : 5,
        firstPrizeCrowns: t.firstPrizeCrowns != null ? Number(t.firstPrizeCrowns) : 0,
        secondPrizeCrowns: t.secondPrizeCrowns != null ? Number(t.secondPrizeCrowns) : 0,
        thirdPrizeCrowns: t.thirdPrizeCrowns != null ? Number(t.thirdPrizeCrowns) : 0,
        killRewardCrowns: t.killRewardCrowns != null ? Number(t.killRewardCrowns) : 1,
        joinRewardCrowns: t.joinRewardCrowns != null ? Number(t.joinRewardCrowns) : 1,
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

    // ── Soft-delete orphans ───────────────────────────────────────────
    // Any Postgres tournament that HAS a firestoreId but that id no
    // longer exists in the current Firestore snapshot = it was deleted
    // from Firestore. Mark it cancelled instead of hard-deleting.
    const cancelled = await prisma.tournament.updateMany({
      where: {
        firestoreId: { not: null, notIn: activeFirestoreIds },
        status: { notIn: ["cancelled", "completed"] },
      },
      data: { status: "cancelled" },
    });

    return NextResponse.json({
      success: true,
      synced,
      cancelled: cancelled.count,
    });
  } catch (err) {
    console.error("Tournament sync error:", err);
    return NextResponse.json(
      { success: false, error: "Sync failed" },
      { status: 500 }
    );
  }
}