import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export async function POST(req) {
  try {
    const { email, crowns } = await req.json();
    if (!email || !crowns) {
      return Response.json({ success: false, message: "Missing fields" }, { status: 400 });
    }

    const result = await sql`
      UPDATE users
      SET crowns = crowns + ${crowns}
      WHERE email = ${email}
      RETURNING crowns
    `;

    return Response.json({ success: true, crowns: result[0].crowns });
  } catch (err) {
    console.error("Add crowns error:", err);
    return Response.json({ success: false, message: "Server error" }, { status: 500 });
  }
}