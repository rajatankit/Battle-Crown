import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../lib/personal-owner";

export async function GET(request) {
  const { uid, response } = await requirePersonalOwner(request);
  if (response) return response;
  return NextResponse.json({ success: true, ownerVerified: true, uid, passkeyEnrollmentReady: true });
}
