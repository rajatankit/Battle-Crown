import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { adminAuth } from "../../../lib/firebase-admin";

export async function GET(req) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!idToken) {
      return NextResponse.json({ success: false, error: "Missing auth token" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (err) {
      return NextResponse.json({ success: false, error: "Invalid or expired token" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { uid: decoded.uid } });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const payments = await prisma.entryPayment.findMany({
      where: { userId: user.id },
      include: { tournament: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, payments });
  } catch (error) {
    console.error("Entry payments fetch error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}