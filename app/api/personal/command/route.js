import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../lib/personal-owner";
import { cortexDispatch } from "../../../lib/cortex/client";
import { askCortexLLM, summarizeCortexResult } from "../../../lib/cortex/llm";

export async function POST(request) {
  const { uid, response } = await requirePersonalOwner(request);
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const command =
    typeof body?.command === "string" ? body.command.trim() : "";

  if (!command) {
    return NextResponse.json(
      { success: false, error: "command is required." },
      { status: 400 }
    );
  }

  try {
    const llm = await askCortexLLM(command);

    if (llm.type === "chat") {
      return NextResponse.json({
        success: true,
        result: {
          success: true,
          agent: "CORTEX",
          message: String(llm.message || "Yes Boss, I am listening."),
        },
      });
    }

    const result = await cortexDispatch({
      task: llm.task || command,
      context: {
        source: "personal_voice",
        uid,
      },
    });

    // The raw CORTEX result (result.data) often holds the real
    // payload (tournament list, wallet balance, room info, etc.)
    // nested under result.data.result / result.data - not in
    // result.message, which is usually a generic "executed
    // successfully" line. Summarize the real payload through the
    // LLM so Boss actually hears the data, not the generic line.
    let message;

    try {
      const summary = await summarizeCortexResult(
        command,
        result?.data ?? result
      );

      message = summary || result?.message || "Done, Boss.";
    } catch {
      message = result?.message || "Done, Boss.";
    }
    if (typeof message === "string" && message.length > 220) {
      message = message.slice(0, 210) + "...";
    }

    return NextResponse.json({
      success: true,
      result: {
        ...result,
        message,
      },
    });
  } catch (error) {
    console.error("Personal command failed:", error);
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