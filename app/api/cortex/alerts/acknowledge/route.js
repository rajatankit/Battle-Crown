import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requirePersonalOwner } from "../../../../lib/personal-owner";

export async function POST(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  try {
    const result = await prisma.alert.updateMany({
      where: { severity: "high", acknowledged: false },
      data: { acknowledged: true },
    });

    return NextResponse.json({ success: true, acknowledged: result.count });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed." },
      { status: 500 }
    );
  }
}