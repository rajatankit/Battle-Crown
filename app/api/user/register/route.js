import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { uid, email, name } = body;

    if (!email || !uid) {
      return NextResponse.json(
        { success: false, error: "Email and UID are required" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Pehle check karo ki kya yeh Email ya UID pehle se database mein hai
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { uid: String(uid) },
          { email: email }
        ]
      },
    }).catch(() => null);
    

    if (existingUser) {
      return NextResponse.json(
        { success: true, user: existingUser },
        { headers: { "Content-Type": "application/json" } }
      );
    }


console.log("UID:", uid);
console.log("EMAIL:", email);
console.log("EXISTING USER:", existingUser);


    // 2. Agar naya user hai, toh bilkul fresh record 0 balance ke sath create karo
    const newUser = await prisma.user.create({
      data: {
        uid: String(uid),
        email,
        name: name || email.split('@')[0],  // agar naam na ho to email ka phela hissa naam ban jayega jisse "player" na aaye
        depositWallet: 0,     // 👈 Naye user ke liye 0 kar diya
        winningsWallet: 0,    // 👈 0
        crowns: 0,            // 👈 0 crowns
      },
    });

    return NextResponse.json(
      { success: true, user: newUser },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("API ERROR:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}