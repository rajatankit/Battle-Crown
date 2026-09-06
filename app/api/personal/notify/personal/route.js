import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { notifyTargetedUsers } from "../../../../lib/notifications/notifyUsers";

export async function POST(req) {
  try {
    const { identifier, message, title } = await req.json();

    if (!identifier || !message?.trim()) {
      return NextResponse.json(
        { success: false, error: "identifier aur message required hain" },
        { status: 400 }
      );
    }

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { bgmiIgn: identifier },
          { ffIgn: identifier },
          { bgmiUid: identifier },
          { ffUid: identifier },
        ],
      },
    });

    if (!user) {
      const match = await prisma.matchHistory.findFirst({
        where: { OR: [{ ign: identifier }, { uid: identifier }] },
      });
      if (match) {
        user = await prisma.user.findUnique({ where: { id: match.userId } });
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: `"${identifier}" naam/id ka player nahi mila` },
        { status: 404 }
      );
    }

    const result = await notifyTargetedUsers({
      userIds: [user.id],
      title: title || "Battle Crown",
      message,
    });

    return NextResponse.json({
      success: true,
      message: `Message "${user.email}" ko bhej diya`,
      sentTo: result.count,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}