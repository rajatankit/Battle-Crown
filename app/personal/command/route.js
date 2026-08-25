import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../lib/personal-owner";

const CORTEX_BRIDGE_URL = process.env.CORTEX_BRIDGE_URL || "https://cortex-21p4.onrender.com";
const CORTEX_BRIDGE_TOKEN = process.env.CORTEX_BRIDGE_TOKEN || "";

export async function POST(request) {
  // 1. Owner verification
  const { uid, response } = await requirePersonalOwner(request);
  if (response) return response;

  // 2. Read command
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const command = (body?.command || "").trim();
  if (!command) {
    return NextResponse.json(
      { success: false, error: "Command is required" },
      { status: 400 }
    );
  }

  // 3. Bridge token check
  if (!CORTEX_BRIDGE_TOKEN) {
    return NextResponse.json(
      { success: false, error: "CORTEX_BRIDGE_TOKEN is not configured" },
      { status: 503 }
    );
  }

  // 4. Call CORTEX Bridge
  try {
    const bridgeResponse = await fetch(`${CORTEX_BRIDGE_URL}/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CORTEX_BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({
        task: command,
        context: {
          source: "personal-command-center",
          uid,
        },
      }),
    });

    const payload = await bridgeResponse.json();

    if (!bridgeResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.detail || payload?.error || "Bridge request failed",
        },
        { status: bridgeResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      result: payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to reach CORTEX bridge",
      },
      { status: 502 }
    );
  }
}