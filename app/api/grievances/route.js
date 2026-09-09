export async function POST(req) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subject, description, tournamentId } = await req.json();

  const grievance = await prisma.grievance.create({
    data: {
      userId: session.user.id,
      tournamentId: tournamentId ? parseInt(tournamentId) : null,
      subject,
      description,
      status: "OPEN",
    },
  });

  return NextResponse.json({ success: true, grievance });
}