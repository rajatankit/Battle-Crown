import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../lib/personal-owner";

const CORTEX_BRIDGE_URL = process.env.CORTEX_BRIDGE_URL;
const CORTEX_BRIDGE_TOKEN = process.env.CORTEX_BRIDGE_TOKEN;

export async function POST(request) {
  const { uid, response } = await requirePersonalOwner(request);
  if (response) return response;

  if (!CORTEX_BRIDGE_URL || !CORTEX_BRIDGE_TOKEN) {
    return NextResponse.json(
      { success: false, error: "CORTEX bridge is not configured." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const requestId =
    typeof body?.request_id === "string" ? body.request_id.trim() : "";
  const agentId =
    typeof body?.agent_id === "string" ? body.agent_id.trim() : "";

  if (!requestId || !agentId) {
    return NextResponse.json(
      { success: false, error: "request_id and agent_id are required." },
      { status: 400 }
    );
  }

  const baseUrl = CORTEX_BRIDGE_URL.replace(/\/+$/, "");

  try {
    const cortexResponse = await fetch(`${baseUrl}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CORTEX_BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({ request_id: requestId, agent_id: agentId }),
      cache: "no-store",
    });

    const data = await cortexResponse.json();

    if (!cortexResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data?.detail || "Approval failed.",
        },
        { status: cortexResponse.status }
      );
    }

    return NextResponse.json({ success: true, result: data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Approval request failed.",
      },
      { status: 502 }
    );
  }
}