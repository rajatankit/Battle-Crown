import { NextResponse } from "next/server";

export async function POST(req) {
  return NextResponse.json(
    {
      success: false,
      message: "Crown redemption for cash is currently disabled.",
    },
    { status: 403 }
  );
}