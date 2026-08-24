import { NextResponse } from "next/server";
import { cortexDispatch } from "../../../../src/lib/cortex/client";

export async function GET(request) {
  try {
    const origin = new URL(request.url).origin;

    const tournamentsResponse = await fetch(
      `${origin}/api/tournaments`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    if (!tournamentsResponse.ok) {
      throw new Error(
        `Battle Crown tournaments API failed with status ${tournamentsResponse.status}`
      );
    }

    const tournamentsData = await tournamentsResponse.json();

    if (!tournamentsData.success) {
      throw new Error(
        tournamentsData.message ||
          "Battle Crown tournament data could not be loaded."
      );
    }

    const tournaments = Array.isArray(tournamentsData.tournaments)
      ? tournamentsData.tournaments
      : [];

    const result = await cortexDispatch({
      agentId: "ARIA",
      action: "read_tournament",
      task: "Read and inspect the current Battle Crown tournament information.",
      context: {
        source: "battle_crown",
        operation: "read_only",
        tournament_count: tournaments.length,
        tournaments,
      },
    });

    return NextResponse.json({
      success: true,
      agent: "ARIA",
      battle_crown: {
        tournament_count: tournaments.length,
        tournaments,
      },
      cortex: result,
    });
  } catch (error) {
    console.error(
      "CORTEX ARIA tournament integration failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
