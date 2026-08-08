import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { adminAuth } from "../../../lib/firebase-admin";

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
      email: decoded.email || null,
    };
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return null;
  }
}

export async function POST(request) {
  try {
    // Firebase token verify
    const firebaseUser = await getVerifiedUser(request);

    if (!firebaseUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: invalid or missing auth token",
        },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const email =
      firebaseUser.email ||
      body.email?.toString().trim().toLowerCase();

    const name =
      body.name?.toString().trim() || "Player";

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "Email is required",
        },
        { status: 400 }
      );
    }

    console.log("========== USER REGISTRATION ==========");
    console.log("Firebase UID:", firebaseUser.uid);
    console.log("Firebase Email:", email);

    // Check whether this Firebase UID already exists
    let existingUser = await prisma.user.findUnique({
      where: {
        uid: firebaseUser.uid,
      },
    });

    if (existingUser) {
      return NextResponse.json({
        success: true,
        message: "User already exists",
        user: {
          id: existingUser.id,
          uid: existingUser.uid,
          email: existingUser.email,
          name: existingUser.name,
        },
      });
    }

    // Check whether email already exists
    const existingEmailUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingEmailUser) {
      // If old database record has no Firebase UID,
      // safely connect it to this Firebase account.
      if (!existingEmailUser.uid) {
        const updatedUser = await prisma.user.update({
          where: {
            id: existingEmailUser.id,
          },
          data: {
            uid: firebaseUser.uid,
            name: existingEmailUser.name || name,
          },
        });

        return NextResponse.json({
          success: true,
          message: "Existing user linked successfully",
          user: {
            id: updatedUser.id,
            uid: updatedUser.uid,
            email: updatedUser.email,
            name: updatedUser.name,
          },
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: "An account with this email already exists",
        },
        { status: 409 }
      );
    }

    // Create new database user
    const newUser = await prisma.user.create({
      data: {
        uid: firebaseUser.uid,
        email,
        name,

        // Explicit defaults for clarity
        depositWallet: 0,
        winningsWallet: 0,
        crowns: 0,
        matchesPlayed: 0,
        level: 1,
        protectionPoints: 5,
      },
    });

    console.log("Database user created successfully");
    console.log("Database ID:", newUser.id);

    return NextResponse.json(
      {
        success: true,
        message: "User created successfully",
        user: {
          id: newUser.id,
          uid: newUser.uid,
          email: newUser.email,
          name: newUser.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("USER REGISTRATION ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create user",
      },
      { status: 500 }
    );
  }
}