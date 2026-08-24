import { NextResponse } from "next/server";
import { cortexDispatch } from "../../../../src/lib/cortex/client";

export async function GET() {
  try {
    const result = await cortexDispatch({
      agentId: "ARIA",
      action: "read_tournament",
      task: "Check tournament status",
      context: {
        source: "battle_crown_cortex_test",
      },
    });

    return NextResponse.json({
      success: true,
      cortex: result,
    });
  } catch (error) {
    console.error("CORTEX bridge test failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}