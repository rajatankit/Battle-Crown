export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#0f141c] text-gray-300 p-6">
      <div className="max-w-3xl mx-auto">

        <h1 className="text-2xl font-bold text-cyan-400 mb-6">
          CONTACT BATTLE CROWN
        </h1>

        <div className="bg-black/40 border border-gray-800 p-6 space-y-5 text-sm">

          <p>
            Need help regarding tournaments, payments, withdrawals,
            or account issues? Contact the Battle Crown support team.
          </p>

          <div>
            <h2 className="text-yellow-400 font-bold mb-2">
              Support Email
            </h2>

            <p>
              battlecrownsupport@gmail.com
            </p>
          </div>


          <div>
            <h2 className="text-yellow-400 font-bold mb-2">
              Tournament Support
            </h2>

            <p>
              For tournament related queries, please provide:
            </p>

            <ul className="list-disc pl-5 mt-2">
              <li>Registered email/username</li>
              <li>Tournament ID</li>
              <li>Transaction details (if required)</li>
            </ul>
          </div>


          <div>
            <h2 className="text-yellow-400 font-bold mb-2">
              Response Time
            </h2>

            <p>
              Our support team will review your request and respond
              as soon as possible.
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