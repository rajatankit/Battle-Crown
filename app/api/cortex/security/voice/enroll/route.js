import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../../lib/personal-owner";
import { prisma } from "../../../../../lib/prisma";
import { enrollVoiceProfile } from "../../../../../lib/cortex/voiceAuth";

export async function POST(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  try {
    const formData = await request.formData();
    const files = formData.getAll("samples");

    if (!files || files.length < 3) {
      return NextResponse.json(
        { success: false, error: "Kam se kam 3 voice samples chahiye enrollment ke liye" },
        { status: 400 }
      );
    }

    const buffers = await Promise.all(
      files.map(async (f) => Buffer.from(await f.arrayBuffer()))
    );

    const profileJson = await enrollVoiceProfile(buffers);

    await prisma.cortexSecurity.updateMany({
      data: { voiceProfile: profileJson, voiceEnrolledAt: new Date() },
    });

    return NextResponse.json({ success: true, message: "Voice profile enroll ho gayi, Boss." });
  } catch (err) {
    console.error("Voice enrollment failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}