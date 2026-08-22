import { NextResponse } from "next/server";
import { getVerifiedUid } from "./verify-auth";

const ownerUid = process.env.PERSONAL_ASSISTANT_OWNER_UID || "";

export async function requirePersonalOwner(request) {
  const uid = await getVerifiedUid(request);
  if (!uid) return { uid: null, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  if (!ownerUid) return { uid: null, response: NextResponse.json({ error: "Personal assistant owner is not configured" }, { status: 503 }) };
  if (uid !== ownerUid) return { uid: null, response: NextResponse.json({ error: "Personal assistant access denied" }, { status: 403 }) };
  return { uid, response: null };
}
