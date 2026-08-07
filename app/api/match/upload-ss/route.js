import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const email = formData.get("email");
    const matchId = formData.get("matchId");

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

    // Upload to Cloudinary instead of local disk — Vercel's filesystem is read-only.
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = `data:${file.type};base64,${buffer.toString("base64")}`;

    const uploadResult = await cloudinary.uploader.upload(base64Data, {
      folder: "battle-crown-screenshots",
      resource_type: "image",
    });

    const screenshotUrl = uploadResult.secure_url;

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