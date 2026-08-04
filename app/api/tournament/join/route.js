import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "fs/promises";
import path from "path";
import { db } from "../../../lib/firebase";
import { doc, updateDoc, increment, getDoc } from "firebase/firestore";
import { calculateLevelFromMatches, sumProtectionPointsBetween } from "../../../lib/levelConfig";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function POST(req) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const email = formData.get("email");
    const tournamentName = formData.get("tournamentName");
    const tournamentId = formData.get("tournamentId");
    const entryFeeStr = formData.get("entryFee") || "10";
    const entryFee = parseFloat(entryFeeStr);
    const ign = formData.get("ign");
    const uid = formData.get("uid");
    const whatsapp_number = formData.get("whatsapp_number");
    const gameType = formData.get("gameType") || "BGMI";
    const mode = formData.get("mode") || "solo";
    const mapName = formData.get("mapName") || (gameType === "Free Fire" ? "Bermuda" : "Erangel");

    if (!email) {
      return NextResponse.json({ success: false, message: "Email is required." }, { status: 400 });
    }

    if (!tournamentId) {
      return NextResponse.json({ success: false, message: "Tournament ID is required." }, { status: 400 });
    }

    // 1. Find User and Check Wallet Balance
    const user = await prisma.user.findUnique({
      where: { email: email },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const currentBalance = user.depositWallet !== undefined ? user.depositWallet : (user.balance || 0);

    if (currentBalance < entryFee) {
      return NextResponse.json({ success: false, message: "Insufficient deposit balance." }, { status: 400 });
    }

    // 2. DUPLICATE JOIN CHECK — same user can't join the same tournament twice.
    // (Previously this query ran but its result was never checked, so the
    // block below never actually prevented a duplicate join.)
    const existingJoin = await prisma.matchHistory.findFirst({
      where: {
        userId: user.id,
        tournamentId: tournamentId,
      },
    });

    if (existingJoin) {
      return NextResponse.json(
        { success: false, message: "You have already joined this tournament." },
        { status: 400 }
      );
    }

    // 3. SLOT FULL CHECK — Firebase se latest joinedCount aur maxSlots check karo
    const tournamentRef = doc(db, "tournaments", tournamentId);
    const tournamentSnap = await getDoc(tournamentRef);

    if (!tournamentSnap.exists()) {
      return NextResponse.json({ success: false, message: "Tournament not found." }, { status: 404 });
    }

    const tournamentData = tournamentSnap.data();
    const maxSlots = tournamentData.maxSlots || 100;
    const joinedCount = tournamentData.joinedCount || 0;

    if (joinedCount >= maxSlots) {
      return NextResponse.json(
        { success: false, message: "This tournament is full. Please try another one." },
        { status: 400 }
      );
    }

    // 4. Screenshot upload (if provided)
    let screenshotUrl = null;
    if (file && typeof file === "object" && file.size > 0 && file.name) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const filename = `${Date.now()}-${file.name.replaceAll(" ", "_")}`;
      const uploadDir = path.join(process.cwd(), "public/uploads");
      const filePath = path.join(uploadDir, filename);
      await writeFile(filePath, buffer);
      screenshotUrl = `/uploads/${filename}`;
    }

    // 5. Level / XP calculation (based on matches played BEFORE this join)
    const oldLevel = user.level;
    const newMatchesPlayed = user.matchesPlayed + 1;
    const newLevel = calculateLevelFromMatches(newMatchesPlayed);
    const protectionPointsGained =
      newLevel > oldLevel ? sumProtectionPointsBetween(oldLevel, newLevel) : 0;

    // 6. Database Transaction: Deduct wallet, +1 Crown, +1 Match XP, Level-up + Create match history
    const updatedUser = await prisma.$transaction(async (prismaClient) => {
      const updated = await prismaClient.user.update({
        where: { email: email },
        data: {
          depositWallet: { decrement: entryFee },
          crowns: { increment: 1 },
          matchesPlayed: { increment: 1 },
          level: newLevel,
          protectionPoints: { increment: protectionPointsGained },
          lastMatchAt: new Date(),
        },
      });

      await prismaClient.matchHistory.create({
        data: {
          userId: user.id,
          tournamentId: tournamentId,
          tournamentName: tournamentName || `${gameType} Tournament`,
          ign: ign || "Player",
          uid: uid ? String(uid) : "",
          whatsapp_number: whatsapp_number ? String(whatsapp_number) : "",
          email: email,
          screenshotUrl: screenshotUrl,
          mapName: mapName,
          gameType: gameType,
          mode: mode,
          entryFee: String(entryFee),
          status: "Pending Verification",
        },
      });

      return updated;
    });

    // 7. FIREBASE UPDATE: increment joinedCount. If this fails, the wallet
    // deduction has already happened, so the failure is logged clearly for
    // manual reconciliation.
    let firebaseSyncFailed = false;
    try {
      await updateDoc(tournamentRef, {
        joinedCount: increment(1),
      });
    } catch (fbError) {
      firebaseSyncFailed = true;
      console.error("FIREBASE SLOT SYNC FAILED — manual fix needed:", {
        tournamentId,
        userId: user.id,
        email,
        error: fbError.message,
      });

      await prisma.matchHistory.updateMany({
        where: { userId: user.id, tournamentId: tournamentId },
        data: { status: "Pending Verification - Firebase Sync Failed" },
      });
    }

    return NextResponse.json({
      success: true,
      message:
        newLevel > oldLevel
          ? `Tournament joined! 🎉 You leveled up to Level ${newLevel}.`
          : "Tournament joined successfully and wallet updated.",
      depositWallet: updatedUser.depositWallet,
      crowns: updatedUser.crowns,
      matchesPlayed: updatedUser.matchesPlayed,
      level: updatedUser.level,
      protectionPoints: updatedUser.protectionPoints,
      leveledUp: newLevel > oldLevel,
      firebaseSyncFailed,
    });
  } catch (error) {
    console.error("Tournament join & wallet error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}