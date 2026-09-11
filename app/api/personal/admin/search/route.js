import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { prisma } from "../../../../lib/prisma";
import { ADMIN_MODELS } from "../../../../lib/cortex/adminModels";

export async function POST(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  try {
    const { model, searchTerm } = await request.json();
    const config = ADMIN_MODELS[model];
    if (!config) {
      return NextResponse.json({ success: false, error: "Invalid model" }, { status: 400 });
    }

    const where = searchTerm?.trim()
      ? {
          OR: config.searchFields.map((f) => ({
            [f]: { contains: searchTerm.trim(), mode: "insensitive" },
          })),
        }
      : {};

    const rows = await prisma[config.prismaModel].findMany({
      where,
      take: 5,
      orderBy: { [config.idField]: "desc" },
    });

    const results = rows.map((row) => {
      const preview = {};
      for (const f of config.displayFields) preview[f] = row[f];
      return preview;
    });

    return NextResponse.json({ success: true, results, count: results.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}