import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    diagnostic: "notifications-route-running",
  });
}

export async function PATCH() {
  return NextResponse.json({
    success: true,
    diagnostic: "notifications-patch-running",
  });
}