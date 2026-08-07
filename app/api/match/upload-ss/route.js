import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "fs/promises";
import path from "path";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function POST(req) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const email = formData.get("email");
    const matchId = formData.get("matchId");
    console.log({
      email,
      matchId,
    });

    if (!file || !email || !matchId) {
      return NextResponse.json(
        { success: false, message: "Screenshot file, email, and matchId are required!" },
        { status: 400 }
      );
    }

    const parsedMatchId = Number(matchId);
    if (isNaN(parsedMatchId)) {
      return NextResponse.json({ success: false, message: "Invalid matchId format" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found in database!" }, { status: 404 });
    }

    // Find the existing match record and make sure it actually belongs to this user
    const existingMatch = await prisma.matchHistory.findUnique({
      where: { id: parsedMatchId },
    });

    if (!existingMatch) {
      return NextResponse.json({ success: false, message: "Match record not found!" }, { status: 404 });
    }

    if (existingMatch.userId !== user.id) {
      return NextResponse.json({ success: false, message: "This match doesn't belong to you!" }, { status: 403 });
    }

    if (existingMatch.screenshotUrl) {
      return NextResponse.json(
        { success: false, message: "Screenshot already submitted for this match!" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const filename = `${Date.now()}-${file.name.replaceAll(" ", "_")}`;
    const uploadDir = path.join(process.cwd(), "public/uploads");
    const filePath = path.join(uploadDir, filename);

    await writeFile(filePath, buffer);
    const screenshotUrl = `/uploads/${filename}`;

    // UPDATE the existing record — do NOT create a new one.
    // This preserves the ign/uid/whatsapp_number that were correctly
    // saved when the player originally joined the tournament.
    const updatedMatch = await prisma.matchHistory.update({
      where: { id: parsedMatchId },
      data: { screenshotUrl },
    });

    return NextResponse.json({
      success: true,
      message: "Screenshot uploaded successfully!",
      matchRecord: updatedMatch,
    });
  } catch (error) {
    console.error("Match upload failed error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}