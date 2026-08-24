import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

function authorized(request) {
  const header = request.headers.get("authorization") || "";

  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  return (
    !!process.env.BATTLE_CROWN_BRIDGE_TOKEN &&
    token === process.env.BATTLE_CROWN_BRIDGE_TOKEN
  );
}

function sanitizeMatch(match) {
  if (!match) return null;

  return {
    id: match.id,
    userId: match.userId,
    tournamentId: match.tournamentId,
    tournamentName: match.tournamentName,
    gameType: match.gameType,
    mapName: match.mapName,
    mode: match.mode,
    entryFee: match.entryFee,
    kills: match.kills,
    rank: match.rank,
    prizeWon: match.prizeWon,
    status: match.status,
    screenshotUrl: match.screenshotUrl,
    createdAt: match.createdAt,
  };
}

export async function POST(request) {
  try {
    if (!authorized(request)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid CORTEX bridge token.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const action = body?.action;
    const context = body?.context || {};

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: "action is required",
        },
        { status: 400 }
      );
    }

    // =====================================================
    // READ MATCH DATA
    // =====================================================

    if (action === "read_match_data") {
      const matchId = context.match_id;

      if (matchId !== undefined && matchId !== null) {
        const parsedId = Number(matchId);

        if (!Number.isInteger(parsedId) || parsedId <= 0) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid match_id",
            },
            { status: 400 }
          );
        }

        const match = await prisma.matchHistory.findUnique({
          where: {
            id: parsedId,
          },
        });

        if (!match) {
          return NextResponse.json({
            success: true,
            status: "not_found",
            match_id: parsedId,
            match: null,
          });
        }

        return NextResponse.json({
          success: true,
          status: "ok",
          match: sanitizeMatch(match),
        });
      }

      const matches = await prisma.matchHistory.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      });

      return NextResponse.json({
        success: true,
        status: "ok",
        count: matches.length,
        matches: matches.map(sanitizeMatch),
      });
    }

    // =====================================================
    // UPDATE MATCH DATA
    // =====================================================

    if (action === "update_match_data") {
      const matchId = context.match_id;
      const updates = context.updates;

      const parsedId = Number(matchId);

      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Valid match_id is required",
          },
          { status: 400 }
        );
      }

      if (
        !updates ||
        typeof updates !== "object" ||
        Array.isArray(updates)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "updates must be an object",
          },
          { status: 400 }
        );
      }

      const allowedUpdates = {};

      if (updates.kills !== undefined) {
        const kills = Number(updates.kills);

        if (!Number.isInteger(kills) || kills < 0) {
          return NextResponse.json(
            {
              success: false,
              error: "kills must be a non-negative integer",
            },
            { status: 400 }
          );
        }

        allowedUpdates.kills = kills;
      }

      if (updates.rank !== undefined) {
        const rank = Number(updates.rank);

        if (!Number.isInteger(rank) || rank < 0) {
          return NextResponse.json(
            {
              success: false,
              error: "rank must be a non-negative integer",
            },
            { status: 400 }
          );
        }

        allowedUpdates.rank = rank;
      }

      if (updates.status !== undefined) {
        allowedUpdates.status = String(updates.status);
      }

      if (Object.keys(allowedUpdates).length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "No supported match fields supplied",
          },
          { status: 400 }
        );
      }

      const existing = await prisma.matchHistory.findUnique({
        where: {
          id: parsedId,
        },
      });

      if (!existing) {
        return NextResponse.json({
          success: true,
          status: "not_found",
          match_id: parsedId,
        });
      }

      if (
        existing.status === "Approved" ||
        existing.status === "Rejected"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Match is already ${existing.status}`,
          },
          { status: 409 }
        );
      }

      const updated = await prisma.matchHistory.update({
        where: {
          id: parsedId,
        },
        data: allowedUpdates,
      });

      return NextResponse.json({
        success: true,
        status: "updated",
        match: sanitizeMatch(updated),
      });
    }

    // =====================================================
    // VERIFY MATCH
    // =====================================================

    if (action === "verify_match") {
      const matchId = Number(context.match_id);
      const verifyAction = String(
        context.verify_action || context.action || "APPROVE"
      ).toUpperCase();

      if (!Number.isInteger(matchId) || matchId <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Valid match_id is required",
          },
          { status: 400 }
        );
      }

      if (
        verifyAction !== "APPROVE" &&
        verifyAction !== "REJECT"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "verify_action must be APPROVE or REJECT",
          },
          { status: 400 }
        );
      }

      const adminSecret = process.env.ADMIN_SECRET_KEY;

      if (!adminSecret) {
        return NextResponse.json(
          {
            success: false,
            error: "ADMIN_SECRET_KEY is not configured.",
          },
          { status: 500 }
        );
      }

      const origin = new URL(request.url).origin;

      const response = await fetch(
        `${origin}/api/admin/verify-match`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminSecret,
          },
          body: JSON.stringify({
            matchId,
            kills: context.kills,
            rank: context.rank,
            action: verifyAction,
          }),
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          {
            success: false,
            status: "verification_failed",
            match_id: matchId,
            error:
              data?.error ||
              "Battle Crown match verification failed.",
          },
          { status: response.status }
        );
      }

      return NextResponse.json({
        success: true,
        status: "verified",
        match_id: matchId,
        verification: data,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: `Unsupported match action: ${action}`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error(
      "CORTEX ORION BRIDGE ERROR:",
      error?.message
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "CORTEX ORION bridge failed",
      },
      { status: 500 }
    );
  }
}
