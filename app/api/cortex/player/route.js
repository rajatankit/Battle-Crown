import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const expectedToken = process.env.BATTLE_CROWN_BRIDGE_TOKEN;

    if (!expectedToken) {
      console.error("BATTLE_CROWN_BRIDGE_TOKEN is not configured");

      return NextResponse.json(
        {
          success: false,
          error: "Battle-Crown bridge token is not configured.",
        },
        { status: 500 }
      );
    }

    if (authorization !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Battle-Crown bridge token.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const playerId = searchParams.get("player_id");
    const email = searchParams.get("email");
    const uid = searchParams.get("uid");

    if (!playerId && !email && !uid) {
      return NextResponse.json(
        {
          success: false,
          error: "player_id, email, or uid is required.",
        },
        { status: 400 }
      );
    }

    let user = null;

    if (email) {
      user = await prisma.user.findUnique({
        where: {
          email,
        },
      });
    } else if (uid) {
      user = await prisma.user.findUnique({
        where: {
          uid,
        },
      });
    } else if (playerId) {
      const numericId = Number(playerId);

      if (Number.isNaN(numericId)) {
        return NextResponse.json(
          {
            success: false,
            error: "player_id must be a valid number.",
          },
          { status: 400 }
        );
      }

      user = await prisma.user.findUnique({
        where: {
          id: numericId,
        },
      });
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          status: "not_found",
          player: null,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "ok",
      player: user,
    });
  } catch (error) {
    console.error("CORTEX PLAYER API ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to read player.",
      },
      { status: 500 }
    );
  }
}
