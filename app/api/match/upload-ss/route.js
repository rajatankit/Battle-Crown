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

    // ==============================
    // VALIDATION
    // ==============================

    if (!file || !email || !matchId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Screenshot file, email, and matchId are required!",
        },
        { status: 400 }
      );
    }

    const parsedMatchId = Number(matchId);

    if (
      !Number.isInteger(parsedMatchId) ||
      parsedMatchId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid matchId format",
        },
        { status: 400 }
      );
    }

    // ==============================
    // FIND USER
    // ==============================

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message:
            "User not found in database!",
        },
        { status: 404 }
      );
    }

    // ==============================
    // FIND MATCH
    // ==============================

    const existingMatch =
      await prisma.matchHistory.findUnique({
        where: {
          id: parsedMatchId,
        },
      });

    if (!existingMatch) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Match record not found!",
        },
        { status: 404 }
      );
    }

    // ==============================
    // CHECK MATCH OWNER
    // ==============================

    if (existingMatch.userId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This match doesn't belong to you!",
        },
        { status: 403 }
      );
    }

    // ==============================
    // PREVENT DUPLICATE SCREENSHOT
    // ==============================

    if (existingMatch.screenshotUrl) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Screenshot already submitted for this match!",
        },
        { status: 400 }
      );
    }

    // ==============================
    // CHECK FILE TYPE
    // ==============================

    if (
      !file.type ||
      !file.type.startsWith("image/")
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Only image files are allowed!",
        },
        { status: 400 }
      );
    }

    // ==============================
    // UPLOAD TO CLOUDINARY
    // ==============================

    const bytes =
      await file.arrayBuffer();

    const buffer = Buffer.from(bytes);

    const base64Data =
      `data:${file.type};base64,` +
      buffer.toString("base64");

    const uploadResult =
      await cloudinary.uploader.upload(
        base64Data,
        {
          folder:
            "battle-crown-screenshots",

          resource_type: "image",
        }
      );

    const screenshotUrl =
      uploadResult.secure_url;

    // ==============================
    // UPDATE MATCH
    // ==============================

    const updatedMatch =
      await prisma.matchHistory.update({
        where: {
          id: parsedMatchId,
        },

        data: {
          screenshotUrl,

          // IMPORTANT:
          // Screenshot submit hone ke baad
          // match admin verification queue mein jayega.
          resultStatus:
            "Pending Verification",
        },
      });

    // ==============================
    // SUCCESS
    // ==============================

    return NextResponse.json({
      success: true,

      message:
        "Screenshot uploaded successfully and sent for verification!",

      matchRecord: updatedMatch,
    });
  } catch (error) {
    console.error(
      "Match upload failed error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "Screenshot upload failed",
      },
      { status: 500 }
    );
  }
}