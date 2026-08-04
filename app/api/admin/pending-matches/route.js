import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const matches = await prisma.matchHistory.findMany({
      where: {
        screenshotUrl: { not: null },
        status: "Pending Verification"
      },
      include: {
        user: {
          select: {
            email: true,
            name: true, // Ya agar tera column 'username' ya 'gameName' hai toh wo likhna
          }
        },
      },
      orderBy: {
        createdAt: 'desc',
      }
    });

    return NextResponse.json({ success: true, matches });
  } catch (error) {
    console.error("Error fetching pending matches:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}