import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

const BATTLE_CROWN_BRIDGE_TOKEN =
  process.env.BATTLE_CROWN_BRIDGE_TOKEN || "";

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function unauthorized() {
  return json(
    {
      status: "error",
      message: "Unauthorized CORTEX bridge request",
    },
    401
  );
}

function getBearerToken(request) {
  const header = request.headers.get("authorization");

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7).trim();
}

function isAuthorized(request) {
  const providedToken = getBearerToken(request);

  return Boolean(
    BATTLE_CROWN_BRIDGE_TOKEN &&
      providedToken &&
      providedToken === BATTLE_CROWN_BRIDGE_TOKEN
  );
}

function normalizeTournamentId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

/*
 * ============================================================
 * POST /api/cortex/rooms
 * ============================================================
 *
 * Supported actions:
 *
 *   store_room_data
 *   read_room_data
 *   update_room_data
 *
 * IMPORTANT:
 * The response status values are part of the CORTEX bridge
 * contract and intentionally differ from HTTP status codes.
 *
 * store -> stored
 * read success -> ok
 * read missing -> not_found
 * update -> updated
 *
 * Missing rooms return HTTP 200 so CORTEX can receive the
 * structured "not_found" result instead of urllib converting
 * HTTP 404 into an exception.
 */

export async function POST(request) {
  try {
    // ----------------------------------------------------------
    // AUTH
    // ----------------------------------------------------------

    if (!isAuthorized(request)) {
      return unauthorized();
    }

    // ----------------------------------------------------------
    // REQUEST
    // ----------------------------------------------------------

    const body = await request.json();

    const action = body?.action;
    const context = body?.context || {};

    if (!action) {
      return json(
        {
          status: "error",
          message: "action is required",
        },
        400
      );
    }

    // ==========================================================
    // STORE ROOM DATA
    // ==========================================================

    if (action === "store_room_data") {
      const roomId = context.room_id;

      const tournamentId = normalizeTournamentId(
        context.tournament_id
      );

      const password = context.password;
      const game = context.game;
      const status = context.status;
      const capacity = context.capacity;

      if (!roomId) {
        return json(
          {
            status: "error",
            message: "room_id is required",
          },
          400
        );
      }

      if (!tournamentId) {
        return json(
          {
            status: "error",
            message: "valid numeric tournament_id is required",
          },
          400
        );
      }

      if (!password) {
        return json(
          {
            status: "error",
            message: "password is required",
          },
          400
        );
      }

      const tournament = await prisma.tournament.findUnique({
        where: {
          id: tournamentId,
        },
      });

      if (!tournament) {
        return json({
          status: "not_found",
          action: "store_room_data",
          message: "Tournament not found",
          tournament_id: tournamentId,
        });
      }

      const updateData = {
        roomId: String(roomId),
        roomPassword: String(password),
      };

      if (
        game !== undefined &&
        game !== null &&
        game !== ""
      ) {
        updateData.game = String(game);
      }

      if (
        status !== undefined &&
        status !== null &&
        status !== ""
      ) {
        updateData.status = String(status);
      }

      if (
        capacity !== undefined &&
        capacity !== null &&
        Number.isInteger(Number(capacity))
      ) {
        updateData.maxSlots = Number(capacity);
      }

      const updatedTournament =
        await prisma.tournament.update({
          where: {
            id: tournamentId,
          },
          data: updateData,
          select: {
            id: true,
            title: true,
            game: true,
            roomId: true,
            roomPassword: true,
            status: true,
            maxSlots: true,
          },
        });

      return json({
        status: "stored",
        action: "store_room_data",
        message: "Protected room data stored successfully",
        data: {
          tournament_id: updatedTournament.id,
          room_id: updatedTournament.roomId,
          tournament_title: updatedTournament.title,
          game: updatedTournament.game,
          status: updatedTournament.status,
          capacity: updatedTournament.maxSlots,
          password: updatedTournament.roomPassword,
        },
      });
    }

    // ==========================================================
    // READ ROOM DATA
    // ==========================================================

    if (action === "read_room_data") {
      const roomId = context.room_id;

      if (!roomId) {
        return json(
          {
            status: "error",
            message: "room_id is required",
          },
          400
        );
      }

      const tournament =
        await prisma.tournament.findFirst({
          where: {
            roomId: String(roomId),
          },
          select: {
            id: true,
            title: true,
            game: true,
            roomId: true,
            roomPassword: true,
            status: true,
            maxSlots: true,
          },
        });

      if (!tournament) {
        return json({
          status: "not_found",
          action: "read_room_data",
          message: "Protected room not found",
          room_id: String(roomId),
        });
      }

      return json({
        status: "ok",
        action: "read_room_data",
        message: "Protected room data retrieved successfully",
        data: {
          tournament_id: tournament.id,
          tournament_title: tournament.title,
          game: tournament.game,
          room_id: tournament.roomId,
          password: tournament.roomPassword,
          status: tournament.status,
          capacity: tournament.maxSlots,
        },
      });
    }

    // ==========================================================
    // UPDATE ROOM DATA
    // ==========================================================

    if (action === "update_room_data") {
      const roomId = context.room_id;
      const updates = context.updates;

      if (!roomId) {
        return json(
          {
            status: "error",
            message: "room_id is required",
          },
          400
        );
      }

      if (
        !updates ||
        typeof updates !== "object" ||
        Array.isArray(updates)
      ) {
        return json(
          {
            status: "error",
            message: "updates must be an object",
          },
          400
        );
      }

      const existingTournament =
        await prisma.tournament.findFirst({
          where: {
            roomId: String(roomId),
          },
          select: {
            id: true,
          },
        });

      if (!existingTournament) {
        return json({
          status: "not_found",
          action: "update_room_data",
          message: "Protected room not found",
          room_id: String(roomId),
        });
      }

      const data = {};

      if (
        updates.password !== undefined &&
        updates.password !== null
      ) {
        data.roomPassword = String(updates.password);
      }

      if (
        updates.room_id !== undefined &&
        updates.room_id !== null &&
        updates.room_id !== ""
      ) {
        data.roomId = String(updates.room_id);
      }

      if (
        updates.game !== undefined &&
        updates.game !== null
      ) {
        data.game = String(updates.game);
      }

      if (
        updates.status !== undefined &&
        updates.status !== null
      ) {
        data.status = String(updates.status);
      }

      if (
        updates.capacity !== undefined &&
        updates.capacity !== null &&
        Number.isInteger(Number(updates.capacity))
      ) {
        data.maxSlots = Number(updates.capacity);
      }

      if (Object.keys(data).length === 0) {
        return json(
          {
            status: "error",
            message: "No valid room updates supplied",
          },
          400
        );
      }

      const updatedTournament =
        await prisma.tournament.update({
          where: {
            id: existingTournament.id,
          },
          data,
          select: {
            id: true,
            title: true,
            game: true,
            roomId: true,
            roomPassword: true,
            status: true,
            maxSlots: true,
          },
        });

      return json({
        status: "updated",
        action: "update_room_data",
        message: "Protected room data updated successfully",
        data: {
          tournament_id: updatedTournament.id,
          tournament_title: updatedTournament.title,
          game: updatedTournament.game,
          room_id: updatedTournament.roomId,
          password: updatedTournament.roomPassword,
          status: updatedTournament.status,
          capacity: updatedTournament.maxSlots,
        },
      });
    }

    // ==========================================================
    // UNKNOWN ACTION
    // ==========================================================

    return json(
      {
        status: "error",
        message: `Unknown CORTEX room action: ${action}`,
      },
      400
    );
  } catch (error) {
    console.error("CORTEX rooms bridge error:", error);

    return json(
      {
        status: "error",
        message: "Internal CORTEX room bridge error",
      },
      500
    );
  }
}
