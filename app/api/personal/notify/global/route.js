import { NextResponse } from "next/server";
import { notifyGlobal } from "../../../../../lib/notifications/notifyUsers";

export async function POST(req) {
  try {
    const { message, title } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ success: false, error: "Message required hai" }, { status: 400 });
    }

    const result = await notifyGlobal({ title: title || "Battle Crown", message });

    return NextResponse.json({
      success: true,
      message: `Global message ${result.count} users ko bhej diya`,
      sentTo: result.count,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}