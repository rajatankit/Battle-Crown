import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { prisma } from "../../../../lib/prisma";
import { ADMIN_MODELS } from "../../../../lib/cortex/adminModels";

export async function POST(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  try {
    const { model, operation, id, updates } = await request.json();
    const config = ADMIN_MODELS[model];
    if (!config) {
      return NextResponse.json({ success: false, error: "Invalid model" }, { status: 400 });
    }
    if (id === undefined || id === null) {
      return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    }

    const idValue = config.idType === "int" ? parseInt(id, 10) : String(id);

    if (operation === "delete") {
      await prisma[config.prismaModel].delete({ where: { [config.idField]: idValue } });
      return NextResponse.json({ success: true, message: `${config.label} delete ho gaya.` });
    }

    if (operation === "update") {
      const safeUpdates = {};
      if (updates) {
        for (const key of Object.keys(updates)) {
          if (config.editableFields.includes(key)) safeUpdates[key] = updates[key];
        }
      }
      if (Object.keys(safeUpdates).length === 0) {
        return NextResponse.json({ success: false, error: "Koi valid field update ke liye nahi mila" }, { status: 400 });
      }

      await prisma[config.prismaModel].update({ where: { [config.idField]: idValue }, data: safeUpdates });
      return NextResponse.json({ success: true, message: `${config.label} update ho gaya.` });
    }

    return NextResponse.json({ success: false, error: "Invalid operation" }, { status: 400 });
  } catch (err) {
    console.error("Admin execute failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}