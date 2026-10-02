// app/api/user/register/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { adminAuth } from "@/app/lib/firebase-admin";

async function getVerifiedUser(request) {
  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!idToken) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email ? decoded.email.toLowerCase() : null,
      emailVerified: decoded.email_verified === true,
    };
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return null;
  }
}

export async function POST(request) {
  try {
    const firebaseUser = await getVerifiedUser(request);

    if (!firebaseUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: invalid or missing auth token" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const email = (firebaseUser.email || body.email || "")
      .toString()
      .trim()
      .toLowerCase();

    const name = body.name?.toString().trim().slice(0, 40) || "Player";

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // 1) UID se user already hai?
    const existingUser = await prisma.user.findUnique({
      where: { uid: firebaseUser.uid },
    });

    if (existingUser) {
      return NextResponse.json({
        success: true,
        message: "User already exists",
        user: existingUser,
      });
    }

    // 2) Email se purana record hai?
    const existingEmailUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmailUser) {
      // Sirf verified email wale ko hi purana record link karne do
      if (!existingEmailUser.uid && firebaseUser.emailVerified) {
        const updatedUser = await prisma.user.update({
          where: { id: existingEmailUser.id },
          data: {
            uid: firebaseUser.uid,
            name: existingEmailUser.name || name,
          },
        });

        return NextResponse.json({
          success: true,
          message: "Existing user linked successfully",
          user: updatedUser,
        });
      }

      return NextResponse.json(
        { success: false, error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // 3) Naya user banao (double-call safe)
    try {
      const newUser = await prisma.user.create({
        data: {
          uid: firebaseUser.uid,
          email,
          name,
          matchesPlayed: 0,
          level: 1,
          protectionPoints: 5,
        },
      });

      return NextResponse.json(
        { success: true, message: "User created successfully", user: newUser },
        { status: 201 }
      );
    } catch (e) {
      // Do requests ek saath aayi to doosri yahan aayegi
      if (e.code === "P2002") {
        const user = await prisma.user.findUnique({
          where: { uid: firebaseUser.uid },
        });
        if (user) {
          return NextResponse.json({
            success: true,
            message: "User already exists",
            user,
          });
        }
      }
      throw e;
    }
  } catch (error) {
    console.error("USER REGISTRATION ERROR:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create user" },
      { status: 500 }
    );
  }
}