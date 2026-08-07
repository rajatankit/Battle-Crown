import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// POST /api/user/update-profile
// body: { email, bgmiIgn?, bgmiUid?, ffIgn?, ffUid?, bio? }
// Only the fields that are present in the body get updated — send just
// what changed (profile fields, or just bio, or both).
export async function POST(req) {
  try {
    const body = await req.json();
    const { email, bgmiIgn, bgmiUid, ffIgn, ffUid, bio } = body;

    if (!email) {
      return NextResponse.json({ success: false, error: "email is required" }, { status: 400 });
    }

    const updateData = {};
    if (bgmiIgn !== undefined) updateData.bgmiIgn = bgmiIgn;
    if (bgmiUid !== undefined) updateData.bgmiUid = bgmiUid;
    if (ffIgn !== undefined) updateData.ffIgn = ffIgn;
    if (ffUid !== undefined) updateData.ffUid = ffUid;
    if (bio !== undefined) updateData.bio = bio;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { email },
      data: updateData,
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}