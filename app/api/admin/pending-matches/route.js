import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  try {
    const matches = await prisma.matchHistory.findMany({
      where: {
        screenshotUrl: { not: null },
        // FIX: schema's actual values are UNVERIFIED | ADMIN_REVIEW |
        // VERIFIED | REJECTED — "Pending Verification" never matched
        // anything, so this always returned an empty list before.
        resultStatus: { in: ["UNVERIFIED", "ADMIN_REVIEW"] },
      },
      include: {
        user: { select: { email: true, name: true } },
        tournament: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedMatches = matches.map((match) => ({
      id: match.id,
      screenshotUrl: match.screenshotUrl,
      kills: match.kills ?? 0,
      rank: match.placement ?? 0,
      ign: match.ign ?? "-",
      uid: match.uid ?? "-",
      email: match.user?.email ?? "-",
      tournamentName: match.tournament?.title ?? "-",
      resultStatus: match.resultStatus ?? "-",
      createdAt: match.createdAt,
    }));

    return NextResponse.json({ success: true, matches: formattedMatches });
  } catch (error) {
    console.error("Error fetching pending matches:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch pending matches" },
      { status: 500 }
    );
  }
}