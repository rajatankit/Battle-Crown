export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#0f141c] text-gray-300 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-cyan-400 mb-6">
          CONTACT BATTLE CROWN
        </h1>

        <div className="bg-black/40 border border-gray-800 p-6 space-y-5 text-sm">
          <p>
            Need help with tournaments, your account, crowns, or the
            platform? Reach out to the Battle Crown support team.
          </p>

          <div>
            <h2 className="text-yellow-400 font-bold mb-2">Support Email</h2>
            <p>
              <a
                href="mailto:battlecrownsupport@gmail.com"
                className="text-cyan-400 hover:underline"
              >
                battlecrownsupport@gmail.com
              </a>
            </p>
          </div>

          <div>
            <h2 className="text-yellow-400 font-bold mb-2">
              Tournament Support
            </h2>
            <p>
              For tournament-related queries, please include:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Registered email</li>
              <li>Tournament name or ID</li>
              <li>In-game name (IGN) / Game UID</li>
              <li>Screenshot or details of the issue (if any)</li>
            </ul>
          </div>

          <div>
            <h2 className="text-yellow-400 font-bold mb-2">
              Account & Crowns
            </h2>
            <p>
              For login issues, profile updates, or crown balance
              questions, email us from your registered address with a
              short description of the problem.
            </p>
          </div>

          <div>
            <h2 className="text-yellow-400 font-bold mb-2">Response Time</h2>
            <p>
              Our team reviews requests as soon as possible, usually
              within 24–48 hours.
            </p>
          </div>

          <div className="border-t border-gray-800 pt-4">
            <p className="text-gray-500 text-xs">
              © 2026 Battle Crown. All Rights Reserved.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}