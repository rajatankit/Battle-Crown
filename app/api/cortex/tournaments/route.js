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

/*
 * POST /api/cortex/tournaments
 *
 * Actions:
 *   create_tournament
 *   get_tournament
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

      // Prisma: entryFee is String?
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

      // ---- 1) Neon / Prisma ----
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

      // ---- 2) Firestore (public — NO roomPassword) ----
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
        // roomPassword intentionally omitted
        neonTournamentId: neonRow.id,
        startTime: neonRow.startTime
          ? neonRow.startTime.toISOString()
          : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "cortex",
        source: "cortex",
      };

      const docRef = await adminDb.collection("tournaments").add(firestorePayload);

      // ---- 3) Link firestoreId back on Neon ----
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
    // GET TOURNAMENT
    // ========================================================
    if (action === "get_tournament") {
      const tournamentId = asInt(context.tournament_id ?? context.id);
      const firestoreId = asString(context.firestore_id);

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
        const snap = await adminDb
          .collection("tournaments")
          .doc(firestoreId)
          .get();

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

      return json(
        {
          status: "error",
          message: "tournament_id or firestore_id is required",
        },
        400
      );
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
