import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getVerifiedUid } from "../../../../lib/verify-auth";

export async function POST(request) {
  try {
    const uid = await getVerifiedUid(request);
    if (!uid) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { role, message } = await request.json();
    if (!role || !message?.trim()) {
      return NextResponse.json(
        { success: false, error: "role aur message required hain" },
        { status: 400 }
      );
    }

    await prisma.conversationLog.create({
      data: { userId: uid, role, message: message.trim() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}