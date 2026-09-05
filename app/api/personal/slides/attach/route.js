import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { adminDb } from "../../../../lib/firebase-admin";

export async function POST(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const firestoreId =
    typeof body?.firestoreId === "string" ? body.firestoreId.trim() : "";
  const slides = Array.isArray(body?.slides)
    ? body.slides.filter((s) => typeof s === "string" && s)
    : null;

  if (!firestoreId) {
    return NextResponse.json(
      { success: false, error: "firestoreId is required." },
      { status: 400 }
    );
  }

  if (!slides || slides.length === 0) {
    return NextResponse.json(
      { success: false, error: "slides array is required." },
      { status: 400 }
    );
  }

  try {
    await adminDb.collection("tournaments").doc(firestoreId).update({
      slides,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, firestoreId, count: slides.length });
  } catch (error) {
    console.error("Slides attach error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to attach slides.",
      },
      { status: 500 }
    );
  }
}