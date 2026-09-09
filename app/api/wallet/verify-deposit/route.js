import { NextResponse } from "next/server";

export async function POST(req) {
  return NextResponse.json(
    { success: false, message: "Deposits are currently disabled." },
    { status: 403 }
  );
}