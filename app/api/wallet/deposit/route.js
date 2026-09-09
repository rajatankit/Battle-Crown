import { NextResponse } from "next/server";
import { logCortexError } from "../../../lib/cortex/errorLogger";

export async function POST(req) {
  try {
    return NextResponse.json(
      {
        success: false,
        message: "Wallet deposit is currently disabled. Please join tournaments directly.",
      },
      { status: 403 }
    );
  } catch (error) {
    await logCortexError("wallet/deposit", error);
    return NextResponse.json(
      { success: false, message: "Internal error" },
      { status: 500 }
    );
  }
}