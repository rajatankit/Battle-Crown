import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";
import { logCortexError } from "@/app/lib/cortex/errorLogger";
import { adminDb } from "@/app/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req, { params }) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const idParam = resolvedParams?.id;

    if (!idParam) {
      return NextResponse.json(
        { success: false, message: "Tournament ID is required" },
        { status: 400 }
      );
    }

    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { ign, uid: gameUid, whatsapp, whatsappNumber, phone } = body;

    const wa =
      (whatsapp || whatsappNumber || phone || "")
        .toString()
        .trim()
        .replace(/\s+/g, "") || null;

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    if (user.banned) {
      return NextResponse.json(
        { success: false, message: "Account is banned" },
        { status: 403 }
      );
    }

    // Tournament resolve — numeric id YA firestoreId
    let tournament = null;
    const numericId = parseInt(idParam, 10);

    if (!isNaN(numericId) && String(numericId) === String(idParam).trim()) {
      tournament = await prisma.tournament.findUnique({
        where: { id: numericId },
      });
    }
    if (!tournament) {
      tournament = await prisma.tournament.findUnique({
        where: { firestoreId: String(idParam) },
      });
    }
    if (!tournament) {
      return NextResponse.json(
        { success: false, message: "Tournament not found" },
        { status: 404 }
      );
    }

    const tournamentId = tournament.id;

    // Optional early duplicate check (unique constraint still catches races)
    const alreadyJoined = await prisma.matchHistory.findFirst({
      where: { userId: user.id, tournamentId },
    });
    if (alreadyJoined) {
      return NextResponse.json(
        {
          success: false,
          message: "You have already joined this tournament.",
        },
        { status: 409 }
      );
    }

    // ── Registration window check ───────────────────────────────────
    // Time is the SOURCE OF TRUTH, not the `status` text field — status
    // gets typed by hand in Firestore and has repeatedly had casing/
    // whitespace typos ("Upcoming", "upcoming ") that silently broke a
    // pure string-equality check here even while the match hadn't
    // actually started yet. Now: registration stays open as long as
    // startTime hasn't passed, and closes automatically the instant it
    // does — no manual status flip needed for this to work correctly.
    // `status` is still checked for explicit admin actions (cancelled).
    const normalizedStatus = (tournament.status || "").trim().toLowerCase();

    if (normalizedStatus === "cancelled" || normalizedStatus === "completed") {
      return NextResponse.json(
        { success: false, message: "Registration closed" },
        { status: 400 }
      );
    }

    if (tournament.startTime && new Date(tournament.startTime).getTime() <= Date.now()) {
      return NextResponse.json(
        { success: false, message: "Registration closed — match has started" },
        { status: 400 }
      );
    }

    if (tournament.joinedCount >= tournament.maxSlots) {
      return NextResponse.json(
        { success: false, message: "Tournament is full" },
        { status: 400 }
      );
    }

    const game = (tournament.game || "").toLowerCase().replace(/\s+/g, "");
    const isFreeFire =
      game === "ff" ||
      game.includes("freefire") ||
      game.startsWith("free");

    if (ign || gameUid || wa) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(wa ? { whatsappNumber: wa } : {}),
          ...(isFreeFire
            ? {
                ffIgn: ign || user.ffIgn,
                ffUid: gameUid || user.ffUid,
              }
            : {
                bgmiIgn: ign || user.bgmiIgn,
                bgmiUid: gameUid || user.bgmiUid,
              }),
        },
      });
    }

    const joinReward = tournament.joinRewardCrowns ?? 1;

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const match = await tx.matchHistory.create({
            data: {
              userId: user.id,
              tournamentId,
              game: tournament.game,
              map: tournament.map,
              mode: tournament.mode,
              ign: ign || null,
              uid: gameUid || null,
              resultStatus: "UNVERIFIED",
            },
          });

          const updatedTournament = await tx.tournament.update({
            where: { id: tournamentId },
            data: { joinedCount: { increment: 1 } },
          });

          let crownsEarned = 0;

          if (joinReward > 0) {
            const wallet = await tx.crownWallet.upsert({
              where: { userId: user.id },
              create: { userId: user.id, balance: 0 },
              update: {},
            });

            await tx.crownWallet.update({
              where: { id: wallet.id },
              data: { balance: { increment: joinReward } },
            });

            await tx.crownTransaction.create({
              data: {
                walletId: wallet.id,
                amount: joinReward,
                type: "earned_match",
                reason: "Join Bonus",
                tournamentId,
              },
            });

            await tx.crownReward.create({
              data: {
                userId: user.id,
                tournamentId,
                matchHistoryId: match.id,
                amount: joinReward,
                reason: "Join Bonus",
              },
            });

            crownsEarned = joinReward;
          }

          return { match, tournament: updatedTournament, crownsEarned };
        },
        { maxWait: 10000, timeout: 15000 }
      );

      if (tournament.firestoreId) {
        try {
          await adminDb
            .collection("tournaments")
            .doc(tournament.firestoreId)
            .update({ joinedCount: FieldValue.increment(1) });
        } catch (fsErr) {
          console.error("Firestore joinedCount sync failed:", fsErr);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Joined! +${result.crownsEarned} crowns`,
        matchId: result.match.id,
        joinedCount: result.tournament.joinedCount,
        crownsEarned: result.crownsEarned,
      });
    } catch (txError) {
      if (txError?.code === "P2002") {
        return NextResponse.json(
          {
            success: false,
            message: "You have already joined this tournament.",
          },
          { status: 409 }
        );
      }
      throw txError;
    }
  } catch (error) {
    console.error("Join Tournament Error:", error);
    await logCortexError("tournaments/[id]/join", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}