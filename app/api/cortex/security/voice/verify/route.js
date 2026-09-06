import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { verifyVoice } from "../../../../../lib/cortex/voiceAuth";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("sample");

    if (!file) {
      return NextResponse.json({ success: false, error: "Audio sample required" }, { status: 400 });
    }

    const security = await prisma.cortexSecurity.findFirst({
      where: { voiceProfile: { not: null } },
    });

    if (!security?.voiceProfile) {
      return NextResponse.json(
        { success: false, error: "Voice enrollment nahi hui abhi" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { score, verified } = await verifyVoice(buffer, security.voiceProfile);

    return NextResponse.json({ success: true, verified, score });
  } catch (err) {
    console.error("Voice verify failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}