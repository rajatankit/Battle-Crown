// app/api/tournaments/sync/route.js
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

      // isSpecial: string label (e.g. "Birth match") or empty
      let isSpecial = null;
      if (t.isSpecial != null && t.isSpecial !== false && t.isSpecial !== "") {
        isSpecial = String(t.isSpecial);
      }

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
        status: (t.status || "upcoming").toLowerCase(),
        firstPrize: t.firstPrize != null ? Number(t.firstPrize) : 0,
        secondPrize: t.secondPrize != null ? Number(t.secondPrize) : 0,
        thirdPrize: t.thirdPrize != null ? Number(t.thirdPrize) : 0,
        killReward: t.killReward != null ? Number(t.killReward) : 5,
        firstPrizeCrowns:
          t.firstPrizeCrowns != null ? Number(t.firstPrizeCrowns) : 0,
        secondPrizeCrowns:
          t.secondPrizeCrowns != null ? Number(t.secondPrizeCrowns) : 0,
        thirdPrizeCrowns:
          t.thirdPrizeCrowns != null ? Number(t.thirdPrizeCrowns) : 0,
        killRewardCrowns:
          t.killRewardCrowns != null ? Number(t.killRewardCrowns) : 1,
        joinRewardCrowns:
          t.joinRewardCrowns != null ? Number(t.joinRewardCrowns) : 1,
        roomId: t.roomId || null,
        roomPassword: t.roomPassword || null,
        startTime: toDate(t.date),
        // ── NEW ──
        // isSpecial: keep label string from Firestore, or null
isSpecial:
  t.isSpecial != null &&
  t.isSpecial !== false &&
  t.isSpecial !== "" &&
  t.isSpecial !== true
    ? String(t.isSpecial)
    : t.isSpecial === true
      ? "Special"
      : null,

isFeatured: Boolean(t.isFeatured),
sponsorPrizeAmount:
  t.sponsorPrizeAmount != null ? Number(t.sponsorPrizeAmount) : 0,
      };

      await prisma.tournament.upsert({
        where: { firestoreId: doc.id },
        update: data,
        create: { firestoreId: doc.id, ...data },
      });

      synced++;
    }

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