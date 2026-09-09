export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rewardId = parseInt(params.rewardId);
  const userId = session.user.id;
  const { upiId } = await req.json();

  if (!upiId) {
    return NextResponse.json({ error: "UPI ID required" }, { status: 400 });
  }

  const reward = await prisma.tournamentReward.findUnique({
    where: { id: rewardId },
  });

  if (!reward || reward.userId !== userId) {
    return NextResponse.json({ error: "Reward not found" }, { status: 404 });
  }

  if (reward.status !== "PENDING_PAYOUT") {
    return NextResponse.json({ error: "Already processed" }, { status: 400 });
  }

  // Check already requested
  const existing = await prisma.withdrawalRequest.findUnique({
    where: { tournamentRewardId: rewardId },
  });

  if (existing) {
    return NextResponse.json({ error: "Payout already requested" }, { status: 400 });
  }

  const withdrawal = await prisma.withdrawalRequest.create({
    data: {
      userId,
      tournamentRewardId: rewardId,
      amount: reward.amount,
      upiId,
      status: "Pending",
    },
  });

  return NextResponse.json({ success: true, withdrawal });
}