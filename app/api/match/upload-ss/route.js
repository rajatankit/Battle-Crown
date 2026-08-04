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
    
    // --- DEBUGGING: Check karo ki frontend se kya values aa rahi hain ---
    console.log("=== FRONTEND FORM DATA RECEIVED ===");
    console.log("file:", formData.get("file") ? "File Present" : "Missing File");
    console.log("email:", formData.get("email"));
    console.log("tournamentName:", formData.get("tournamentName"));
    console.log("ign:", formData.get("ign"));
    console.log("uid:", formData.get("uid"));
    console.log("whatsapp_number:", formData.get("whatsapp_number"));
    console.log("====================================");

    const file = formData.get("file");
    const email = formData.get("email");
    const tournamentName = formData.get("tournamentName");
    const ign = formData.get("ign");
    const uid = formData.get("uid");
    const whatsapp_number = formData.get("whatsapp_number");

    if (!file || !email) {
      return NextResponse.json({ success: false, message: "Screenshot file and email are required!" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found in database!" }, { status: 404 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const filename = `${Date.now()}-${file.name.replaceAll(" ", "_")}`;
    const uploadDir = path.join(process.cwd(), "public/uploads");
    const filePath = path.join(uploadDir, filename);

    await writeFile(filePath, buffer);
    const screenshotUrl = `/uploads/${filename}`;

    const matchRecord = await prisma.matchHistory.create({
      data: {
        userId: user.id,
        tournamentName: tournamentName || "BGMI Tournament",
        ign: ign || "Player",
        uid: uid,
        whatsapp_number: whatsapp_number,
        email: email,
        screenshotUrl: screenshotUrl,
        mapName: "Erangel",
        gameType: "BGMI",
        entryFee: "10",
        status: "Pending Verification",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Screenshot uploaded successfully!",
      matchRecord,
    });

  } catch (error) {
    console.error("Match upload failed error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}