import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../lib/personal-owner";
import { cortexDispatch } from "../../../lib/cortex/client";
import { askCortexLLM } from "../../../lib/cortex/llm";

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
    // 1. LLM se poochho — baat hai ya tool?
    const llm = await askCortexLLM(command);

    // 2. Sirf baat-cheet
    if (llm.type === "chat") {
      return NextResponse.json({
        success: true,
        result: {
          success: true,
          agent: "CORTEX",
          message: llm.message,
        },
      });
    }

    // 3. Real command → existing CORTEX pipeline
    const result = await cortexDispatch({
      task: llm.task || command,
      context: {
        source: "personal_voice",
        uid,
      },
    });

    // Short human message
    let message =
      result?.message ||
      result?.data?.message ||
      "Ho gaya bhai.";

    if (
      typeof message === "string" &&
      (message.includes("Intent identified") ||
        message.includes("Unable to identify"))
    ) {
      message = result?.success
        ? "Ho gaya bhai."
        : "Yeh command abhi support nahi kar raha.";
    }

    // Keep short
    if (typeof message === "string" && message.length > 120) {
      message = message.slice(0, 110) + "...";
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