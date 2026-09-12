import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getVerifiedUid } from "../../../../lib/verify-auth";
import { askGemini } from "../../../../lib/gemini";

export async function POST(request) {
  try {
    const uid = await getVerifiedUid(request);
    if (!uid) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { question } = await request.json();
    if (!question?.trim()) {
      return NextResponse.json({ success: false, error: "question required hai" }, { status: 400 });
    }

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const logs = await prisma.conversationLog.findMany({
      where: { userId: uid, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 400,
    });

    if (logs.length === 0) {
      return NextResponse.json({
        success: true,
        answer: "Boss, pichle 3 din mein hamari koi baat record nahi hui.",
      });
    }

    const transcript = logs
      .map(
        (l) =>
          `[${l.createdAt.toISOString()}] ${l.role === "user" ? "Boss" : "CORTEX"}: ${l.message}`
      )
      .join("\n");

    const prompt = `Tum CORTEX ho, ek personal AI assistant jo Hinglish mein baat karta hai, thoda witty aur respectful hai (user ko "Boss" bolta hai). Neeche pichle 3 din ki conversation history di hai. User ne ek sawaal poocha hai uske aadhar par. Sirf history ke aadhar par jawab do, chhota aur natural — jaise ek assistant apne boss ko update de raha ho.

Conversation history:
${transcript}

Boss ka sawaal: "${question}"

Jawab (Hinglish, 1-3 sentences, natural tone):`;

    const answer = await askGemini(prompt);

    return NextResponse.json({ success: true, answer });
  } catch (err) {
    console.error("Recall error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}