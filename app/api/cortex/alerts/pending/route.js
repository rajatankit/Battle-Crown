import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requirePersonalOwner } from "../../../../lib/personal-owner";

export async function GET(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  try {
    const pending = await prisma.alert.findMany({
      where: { acknowledged: false },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 10,
    });

    return NextResponse.json({ success: true, alerts: pending, count: pending.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}