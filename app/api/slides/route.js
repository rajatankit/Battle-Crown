import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const game = searchParams.get("game") || "ff";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "8", 10)));

    if (!["ff", "bgmi"].includes(game)) {
      return NextResponse.json(
        { error: "Invalid game. Use ff or bgmi" },
        { status: 400 }
      );
    }

    const prefix = `slides/${game}/`;

    // Cloudinary se resources lao
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: prefix,
      max_results: 100, // future ke liye enough
      resource_type: "image",
    });

    const allSlides = (result.resources || []).map((item, index) => ({
      id: item.public_id,
      url: item.secure_url,
      width: item.width,
      height: item.height,
      created_at: item.created_at,
    }));

    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const slides = allSlides.slice(start, end);
    const total = allSlides.length;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      game,
      page,
      limit,
      total,
      totalPages,
      slides,
    });
  } catch (error) {
    console.error("Slides API Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load slides" },
      { status: 500 }
    );
  }
}