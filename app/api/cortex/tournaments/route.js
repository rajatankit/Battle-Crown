import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { adminDb } from "../../../lib/firebase-admin";

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
  if (!header || !header.startsWith("Bearer ")) return null;
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

function asString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function asInt(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return fallback;
  return n;
}

function asFloat(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function asDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Finds a tournament row by id (preferred) or by a fuzzy, case-insensitive
// title match (most recent match wins if several exist). Shared by
// update_tournament and delete_tournament so both resolve a target
// the same way.
async function findTournamentRow(context) {
  const tournamentId = asInt(context.tournament_id ?? context.id);
  if (tournamentId) {
    return prisma.tournament.findUnique({ where: { id: tournamentId } });
  }

  const title = asString(context.title);
  if (title) {
    return prisma.tournament.findFirst({
      where: { title: { contains: title, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
  }

  return null;
}

/*
 * POST /api/cortex/tournaments
 *
 * Actions:
 *   create_tournament
 *   get_tournament     (by tournament_id, firestore_id, or title)
 *   update_tournament  (by tournament_id or title - edits fields)
 *   delete_tournament  (by tournament_id or title)
 *
 * Hybrid:
 *   Neon  = ops + room secrets (roomId, roomPassword)
 *   Firestore = public list (website)
 */

export async function POST(request) {
  try {
    if (!isAuthorized(request)) {
      return unauthorized();
    }

    const body = await request.json();
    const action = body?.action;
    const context = body?.context || {};

    if (!action) {
      return json({ status: "error", message: "action is required" }, 400);
    }

    // ========================================================
    // CREATE TOURNAMENT
    // ========================================================
    if (action === "create_tournament") {
      const title = asString(context.title || context.name);
      const game = asString(context.game, "Free Fire");
      const map = asString(context.map) || null;
      const mode = asString(context.mode) || null;
      const status = asString(context.status, "upcoming") || "upcoming";

      const entryFeeRaw = context.entry_fee ?? context.entryFee;
      const entryFee =
        entryFeeRaw === undefined || entryFeeRaw === null || entryFeeRaw === ""
          ? null
          : String(entryFeeRaw);

      const maxSlots = asInt(context.capacity ?? context.maxSlots, 100) ?? 100;
      const firstPrize = asFloat(context.first_prize ?? context.firstPrize, 0);
      const secondPrize = asFloat(context.second_prize ?? context.secondPrize, 0);
      const thirdPrize = asFloat(context.third_prize ?? context.thirdPrize, 0);
      const killReward = asFloat(context.kill_reward ?? context.killReward, 5);

      const roomId = asString(context.room_id ?? context.roomId) || null;
      const roomPassword =
        asString(
          context.password ?? context.room_password ?? context.roomPassword
        ) || null;

      const startTime = asDate(context.start_time ?? context.startTime);

      if (!title) {
        return json({ status: "error", message: "title is required" }, 400);
      }

      const neonRow = await prisma.tournament.create({
        data: {
          title,
          game,
          map,
          mode,
          entryFee,
          maxSlots,
          status,
          firstPrize: firstPrize ?? 0,
          secondPrize: secondPrize ?? 0,
          thirdPrize: thirdPrize ?? 0,
          killReward: killReward ?? 5,
          roomId,
          roomPassword,
          startTime,
        },
        select: {
          id: true,
          title: true,
          game: true,
          map: true,
          mode: true,
          entryFee: true,
          maxSlots: true,
          status: true,
          firstPrize: true,
          secondPrize: true,
          thirdPrize: true,
          killReward: true,
          roomId: true,
          roomPassword: true,
          startTime: true,
          firestoreId: true,
        },
      });

      const firestorePayload = {
        title: neonRow.title,
        name: neonRow.title,
        game: neonRow.game,
        map: neonRow.map,
        mode: neonRow.mode,
        entryFee: neonRow.entryFee,
        maxSlots: neonRow.maxSlots,
        capacity: neonRow.maxSlots,
        joinedCount: 0,
        status: neonRow.status,
        firstPrize: neonRow.firstPrize,
        secondPrize: neonRow.secondPrize,
        thirdPrize: neonRow.thirdPrize,
        killReward: neonRow.killReward,
        roomId: neonRow.roomId,
        neonTournamentId: neonRow.id,
        startTime: neonRow.startTime ? neonRow.startTime.toISOString() : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "cortex",
        source: "cortex",
      };

      const docRef = await adminDb.collection("tournaments").add(firestorePayload);

      const linked = await prisma.tournament.update({
        where: { id: neonRow.id },
        data: { firestoreId: docRef.id },
        select: {
          id: true,
          firestoreId: true,
          title: true,
          game: true,
          status: true,
          maxSlots: true,
          roomId: true,
          roomPassword: true,
        },
      });

      return json({
        status: "created",
        action: "create_tournament",
        message: "Tournament created in Firestore + Neon",
        data: {
          tournament_id: linked.id,
          firestore_id: linked.firestoreId,
          title: linked.title,
          game: linked.game,
          status: linked.status,
          capacity: linked.maxSlots,
          room_id: linked.roomId,
          password: linked.roomPassword,
        },
      });
    }

    // ========================================================
    // GET TOURNAMENT  (by id, firestore_id, or title)
    // ========================================================
    if (action === "get_tournament") {
      const tournamentId = asInt(context.tournament_id ?? context.id);
      const firestoreId = asString(context.firestore_id);
      const title = asString(context.title);

      if (tournamentId) {
        const row = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: {
            id: true,
            firestoreId: true,
            title: true,
            game: true,
            map: true,
            mode: true,
            entryFee: true,
            maxSlots: true,
            status: true,
            roomId: true,
            roomPassword: true,
            startTime: true,
          },
        });

        if (!row) {
          return json({
            status: "not_found",
            action: "get_tournament",
            message: "Tournament not found in Neon",
            tournament_id: tournamentId,
          });
        }

        return json({
          status: "ok",
          action: "get_tournament",
          data: {
            tournament_id: row.id,
            firestore_id: row.firestoreId,
            title: row.title,
            game: row.game,
            map: row.map,
            mode: row.mode,
            entryFee: row.entryFee,
            capacity: row.maxSlots,
            status: row.status,
            room_id: row.roomId,
            password: row.roomPassword,
            startTime: row.startTime,
          },
        });
      }

      if (firestoreId) {
        const snap = await adminDb.collection("tournaments").doc(firestoreId).get();

        if (!snap.exists) {
          return json({
            status: "not_found",
            action: "get_tournament",
            message: "Tournament not found in Firestore",
            firestore_id: firestoreId,
          });
        }

        return json({
          status: "ok",
          action: "get_tournament",
          data: { firestore_id: snap.id, ...snap.data() },
        });
      }

      if (title) {
        const row = await prisma.tournament.findFirst({
          where: { title: { contains: title, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            firestoreId: true,
            title: true,
            game: true,
            map: true,
            mode: true,
            entryFee: true,
            maxSlots: true,
            status: true,
            roomId: true,
            roomPassword: true,
            startTime: true,
          },
        });

        if (!row) {
          return json({
            status: "not_found",
            action: "get_tournament",
            message: "No tournament matched that title",
            title,
          });
        }

        return json({
          status: "ok",
          action: "get_tournament",
          data: {
            tournament_id: row.id,
            firestore_id: row.firestoreId,
            title: row.title,
            game: row.game,
            map: row.map,
            mode: row.mode,
            entryFee: row.entryFee,
            capacity: row.maxSlots,
            status: row.status,
            room_id: row.roomId,
            password: row.roomPassword,
            startTime: row.startTime,
          },
        });
      }

      return json(
        {
          status: "error",
          message: "tournament_id, firestore_id, or title is required",
        },
        400
      );
    }

    // ========================================================
    // UPDATE TOURNAMENT  (by tournament_id or title)
    // ========================================================
    if (action === "update_tournament") {
      const row = await findTournamentRow(context);

      if (!row) {
        return json({
          status: "not_found",
          action: "update_tournament",
          message: "Tournament not found for update",
        });
      }

      const data = {};
      if (context.new_title) data.title = asString(context.new_title);
      if (context.game !== undefined) data.game = asString(context.game) || row.game;
      if (context.map !== undefined) data.map = asString(context.map) || null;
      if (context.mode !== undefined) data.mode = asString(context.mode) || null;
      if (context.entryFee !== undefined || context.entry_fee !== undefined) {
        const v = context.entryFee ?? context.entry_fee;
        data.entryFee = v === "" || v === null ? null : String(v);
      }
      if (context.maxSlots !== undefined || context.capacity !== undefined) {
        data.maxSlots = asInt(context.maxSlots ?? context.capacity, row.maxSlots);
      }
      if (context.status !== undefined) data.status = asString(context.status) || row.status;
      if (context.firstPrize !== undefined || context.first_prize !== undefined) {
        data.firstPrize = asFloat(context.firstPrize ?? context.first_prize, row.firstPrize);
      }
      if (context.secondPrize !== undefined || context.second_prize !== undefined) {
        data.secondPrize = asFloat(context.secondPrize ?? context.second_prize, row.secondPrize);
      }
      if (context.thirdPrize !== undefined || context.third_prize !== undefined) {
        data.thirdPrize = asFloat(context.thirdPrize ?? context.third_prize, row.thirdPrize);
      }
      if (context.killReward !== undefined || context.kill_reward !== undefined) {
        data.killReward = asFloat(context.killReward ?? context.kill_reward, row.killReward);
      }
      if (context.startTime !== undefined || context.start_time !== undefined) {
        data.startTime = asDate(context.startTime ?? context.start_time);
      }

      if (Object.keys(data).length === 0) {
        return json({ status: "error", message: "No updatable fields provided" }, 400);
      }

      const updated = await prisma.tournament.update({
        where: { id: row.id },
        data,
        select: {
          id: true,
          firestoreId: true,
          title: true,
          game: true,
          map: true,
          mode: true,
          entryFee: true,
          maxSlots: true,
          status: true,
          firstPrize: true,
          secondPrize: true,
          thirdPrize: true,
          killReward: true,
          startTime: true,
        },
      });

      if (updated.firestoreId) {
        const firestorePayload = { updatedAt: new Date().toISOString() };
        if (data.title !== undefined) {
          firestorePayload.title = updated.title;
          firestorePayload.name = updated.title;
        }
        if (data.game !== undefined) firestorePayload.game = updated.game;
        if (data.map !== undefined) firestorePayload.map = updated.map;
        if (data.mode !== undefined) firestorePayload.mode = updated.mode;
        if (data.entryFee !== undefined) firestorePayload.entryFee = updated.entryFee;
        if (data.maxSlots !== undefined) {
          firestorePayload.maxSlots = updated.maxSlots;
          firestorePayload.capacity = updated.maxSlots;
        }
        if (data.status !== undefined) firestorePayload.status = updated.status;
        if (data.firstPrize !== undefined) firestorePayload.firstPrize = updated.firstPrize;
        if (data.secondPrize !== undefined) firestorePayload.secondPrize = updated.secondPrize;
        if (data.thirdPrize !== undefined) firestorePayload.thirdPrize = updated.thirdPrize;
        if (data.killReward !== undefined) firestorePayload.killReward = updated.killReward;
        if (data.startTime !== undefined) {
          firestorePayload.startTime = updated.startTime ? updated.startTime.toISOString() : null;
        }

        await adminDb.collection("tournaments").doc(updated.firestoreId).update(firestorePayload);
      }

      return json({
        status: "updated",
        action: "update_tournament",
        message: `Tournament "${updated.title}" updated`,
        data: {
          tournament_id: updated.id,
          firestore_id: updated.firestoreId,
          title: updated.title,
          game: updated.game,
          status: updated.status,
        },
      });
    }

    // ========================================================
    // DELETE TOURNAMENT  (by tournament_id or title)
    // ========================================================
    if (action === "delete_tournament") {
      const row = await findTournamentRow(context);

      if (!row) {
        return json({
          status: "not_found",
          action: "delete_tournament",
          message: "Tournament not found for deletion",
        });
      }

      if (row.firestoreId) {
        try {
          await adminDb.collection("tournaments").doc(row.firestoreId).delete();
        } catch (err) {
          console.error("Firestore delete failed:", err);
        }
      }

      await prisma.tournament.delete({ where: { id: row.id } });

      return json({
        status: "deleted",
        action: "delete_tournament",
        message: `Tournament "${row.title}" deleted`,
        data: { tournament_id: row.id, title: row.title },
      });
    }

    return json(
      {
        status: "error",
        message: `Unknown CORTEX tournament action: ${action}`,
      },
      400
    );
  } catch (error) {
    console.error("CORTEX tournaments bridge error:", error);
    return json(
      {
        status: "error",
        message: error?.message || "Internal CORTEX tournament bridge error",
      },
      500
    );
  }
}