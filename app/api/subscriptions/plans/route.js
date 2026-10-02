import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { priceMonthlyPaisa: "asc" },
      select: {
        id: true,
        name: true,
        priceMonthlyPaisa: true,
        priceAnnualPaisa: true,
        monthlyTournamentLimit: true,
        dailyAiQueryLimit: true,
        crownOrganizeCost: true,
        featuresJson: true,
      },
    });

    // Free tier has no DB row — it's the implicit default for a user
    // with no active UserSubscription. Prepend it so the pricing page
    // can render all 4 cards from one response.
    const free = {
      id: null,
      name: "free",
      priceMonthlyPaisa: 0,
      priceAnnualPaisa: 0,
      monthlyTournamentLimit: 0,
      dailyAiQueryLimit: 5,
      crownOrganizeCost: null,
      featuresJson: { label: "Free", aiQueriesPerDay: 5, organizePerMonth: 0, crownOrganize: false },
    };

    return NextResponse.json({ success: true, plans: [free, ...plans] });
  } catch (error) {
    console.error("GET subscription plans error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}