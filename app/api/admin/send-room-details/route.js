import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const { tournamentId, roomId, roomPassword } = await req.json();

    if (!tournamentId || !roomId || !roomPassword) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Tournament join karne wale players nikalo
    const players = await prisma.matchHistory.findMany({
      where: {
        tournamentId: String(tournamentId),
      },
      select: {
        userId: true,
      },
    });

    if (players.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No players found",
      });
    }

    // Har player ka UID nikalo
    for (const player of players) {
      const user = await prisma.user.findUnique({
        where: {
          id: player.userId,
        },
        select: {
          uid: true,
        },
      });

      if (!user?.uid) continue;

      await prisma.notification.create({
        data: {
          type: "PERSONAL",
          userId: user.uid,
          title: "🎮 Room Details Released",
          message: `Room ID: ${roomId}\nPassword: ${roomPassword}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Notifications Created Successfully",
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
const saveRoomDetails = async () => {
  if (!selectedTournament) return;

  try {
    // 1. Firebase me Room Details save karo
    await updateDoc(
      doc(db, "tournaments", selectedTournament.id),
      {
        roomId,
        roomPassword,
      }
    );

    // 2. Backend API ko call karo
    const response = await fetch("/api/admin/send-room-details", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tournamentId: selectedTournament.id,
        roomId,
        roomPassword,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message);
    }

    alert("✅ Room Details Saved & Notifications Sent");

    setSelectedTournament(null);

  } catch (err) {
    console.error(err);
    alert("❌ " + err.message);
  }
};