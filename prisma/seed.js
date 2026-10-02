// prisma/seed.js
// Run: node prisma/seed.js
// (or wire into package.json -> "prisma": { "seed": "node prisma/seed.js" }
//  and run `npx prisma db seed`)

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PLANS = [
  {
    name: "upgrade",
    priceMonthlyPaisa: 19900, // ₹199
    priceAnnualPaisa: 199900, // ₹1,999 (2 months free)
    monthlyTournamentLimit: 2,
    dailyAiQueryLimit: 50,
    crownOrganizeCost: null, // crown-organize path NOT allowed on this plan
    featuresJson: {
      label: "Upgrade",
      aiQueriesPerDay: 50,
      organizePerMonth: 2,
      crownOrganize: false,
    },
    active: true,
  },
  {
    name: "pro",
    priceMonthlyPaisa: 49900, // ₹499
    priceAnnualPaisa: 499900, // ₹4,999
    monthlyTournamentLimit: 8,
    dailyAiQueryLimit: 300,
    crownOrganizeCost: 40,
    featuresJson: {
      label: "Pro",
      aiQueriesPerDay: 300,
      organizePerMonth: 8,
      crownOrganize: true,
      crownOrganizeCost: 40,
    },
    active: true,
  },
  {
    name: "promax",
    priceMonthlyPaisa: 99900, // ₹999
    priceAnnualPaisa: 999900, // ₹9,999
    monthlyTournamentLimit: -1, // unlimited
    dailyAiQueryLimit: -1, // unlimited
    crownOrganizeCost: 25,
    featuresJson: {
      label: "ProMax",
      aiQueriesPerDay: "unlimited",
      organizePerMonth: "unlimited",
      crownOrganize: true,
      crownOrganizeCost: 25,
    },
    active: true,
  },
];

async function main() {
  for (const plan of PLANS) {
    const result = await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: plan, // re-running the seed keeps prices/limits in sync
      create: plan,
    });
    console.log(`Seeded plan: ${result.name} (id=${result.id})`);
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });