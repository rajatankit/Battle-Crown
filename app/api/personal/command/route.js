import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../lib/personal-owner";
import { cortexDispatch } from "../../../../src/lib/cortex/client";

export async function POST(request) {
  const { uid, response } = await requirePersonalOwner(request);

  if (response) {
    return response;
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body.",
      },
      { status: 400 }
    );
  }

  const command =
    typeof body?.command === "string"
      ? body.command.trim()
      : "";

  if (!command) {
    return NextResponse.json(
      {
        success: false,
        error: "command is required.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await cortexDispatch({
      agentId:
        typeof body?.agentId === "string"
          ? body.agentId
          : undefined,

      action:
        typeof body?.action === "string"
          ? body.action
          : undefined,

      task: command,

      context: {
        source: "personal_voice",
        uid,
      },
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error(
      "Personal voice command dispatch failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "CORTEX dispatch failed.",
      },
      { status: 502 }
    );
  }
}
