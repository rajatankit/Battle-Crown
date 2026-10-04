// app/api/admin/fix-stuck-matches/route.js
//
// ONE-TIME USE: fixes match_histories rows stuck on the old invalid
// resultStatus value "Pending Verification" (from the upload-ss bug),
// moving them to "ADMIN_REVIEW" so they show up in /admin/verify.
//
// Uses the app's own Prisma connection instead of Neon's web SQL
// editor, so it isn't affected by the SQL editor's separate compute
// usage limit. Protected by the same admin auth as other admin routes.
//
// DELETE THIS FILE after running it once — it has no reason to exist
// after the stuck rows are fixed.

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  try {
    const result = await prisma.matchHistory.updateMany({
      where: { resultStatus: "Pending Verification" },
      data: { resultStatus: "ADMIN_REVIEW" },
    });

    return NextResponse.json({
      success: true,
      message: `Fixed ${result.count} stuck match(es).`,
      count: result.count,
    });
  } catch (error) {
    console.error("fix-stuck-matches error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Fix failed" },
      { status: 500 }
    );
  }
}