export default function RulesPage() {
  return (
    <main className="min-h-screen bg-[#0f141c] text-gray-300 p-6">
      <div className="max-w-4xl mx-auto">

        <h1 className="text-2xl font-bold text-cyan-400 mb-6">
          🛡️ BATTLE CROWN — OFFICIAL RULES & REGULATIONS
        </h1>

        <div className="bg-black/40 border border-gray-800 p-6 space-y-6 text-sm leading-relaxed">

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">1. Eligibility</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Participants must have a valid Battle Crown account.</li>
              <li>Only one account per player is allowed. Multiple accounts are strictly prohibited.</li>
              <li>Players must provide a valid Game UID and IGN. Incorrect details may lead to disqualification.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">2. Tournament Entry</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>All tournaments are free to join — no entry fee, ever.</li>
              <li>Joining a tournament confirms acceptance of all Battle Crown rules.</li>
              <li>Your slot is personal and cannot be transferred to another player.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">3. Room Details</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Room ID & Password will be shown approximately 10 minutes before match start.</li>
              <li>Players are responsible for joining on time.</li>
              <li>Battle Crown is not responsible for internet or device issues.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">4. Match Start Rules</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Players must join before the scheduled time. Late players may lose their slot.</li>
              <li>Matches will start according to schedule — no rematch for late joining.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">5. Fair Play Policy</h2>
            <p className="mb-1">The following are strictly prohibited:</p>
            <ul className="list-disc pl-5 space-y-1 grid grid-cols-1 sm:grid-cols-2 gap-x-2">
              <li>Hacks / Cheats</li>
              <li>Mod APKs</li>
              <li>ESP</li>
              <li>Aim Assist</li>
              <li>Wall Hack</li>
              <li>Speed Hack</li>
              <li>Third-party software</li>
              <li>Unauthorized emulator usage (in mobile-only tournaments)</li>
              <li>Teaming (Solo matches)</li>
              <li>Account sharing</li>
              <li>Intentional feeding</li>
              <li>Match fixing</li>
              <li>Exploiting game bugs</li>
            </ul>
            <p className="text-red-400 font-bold mt-2">Violation results in immediate disqualification.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">6. Result Submission</h2>
            <p className="mb-1">Players must upload:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Match Screenshot</li>
              <li>Correct Kill Count</li>
              <li>Rank</li>
            </ul>
            <p className="mt-1">False submissions may result in permanent suspension.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">7. Crown Rewards</h2>
            <p className="mb-1">Crown reward calculation includes:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Join Bonus — credited instantly when you join</li>
              <li>Placement Reward (if applicable)</li>
              <li>Per-Kill Reward (if applicable)</li>
            </ul>
            <p className="mt-1">Placement and per-kill Crowns are credited only after admin verification.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">8. Verification Process</h2>
            <p className="mb-1">Battle Crown reserves the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Review screenshots</li>
              <li>Request additional proof</li>
              <li>Delay crown crediting if verification is pending</li>
              <li>Reject suspicious results</li>
            </ul>
            <p className="mt-1">Admin decisions are final.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">9. Crowns — No Cash Value</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Crowns are a free in-platform reward, earned only by playing — they can never be purchased with real money.</li>
              <li>Crowns can be spent to unlock organizing your own tournament.</li>
              <li>Crowns have no cash redemption value and cannot be withdrawn or transferred.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">10. Disqualification</h2>
            <p className="mb-1">Players may be disqualified for:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fake screenshots, kills, or ranks</li>
              <li>Toxic behaviour or abusive language</li>
              <li>Impersonation</li>
              <li>Rule violations or cheating</li>
            </ul>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">11. Account Suspension</h2>
            <p className="mb-1">Battle Crown may temporarily or permanently suspend accounts for:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fraud or abuse of the crown system</li>
              <li>Multiple accounts</li>
              <li>Exploits or security violations</li>
            </ul>
            <p className="mt-1">Suspended accounts lose tournament eligibility.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">12. Tournament Cancellation</h2>
            <p className="mb-1">Battle Crown (or a tournament organizer) may cancel tournaments because of:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Server maintenance or technical issues</li>
              <li>Low participation</li>
              <li>Emergency situations</li>
            </ul>
            <p className="mt-1">Since tournaments are free, no refund is applicable for players. If an organizer spent crowns to create the tournament, those crowns are not refunded on cancellation.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">13. Network Responsibility</h2>
            <p>Battle Crown is not responsible for: internet disconnection, device overheating, power failure, game crashes, ping issues, or FPS drops.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">14. Content Policy</h2>
            <p className="mb-1">Players must not upload:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Edited screenshots or fake proof</li>
              <li>Offensive or illegal content</li>
            </ul>
            <p className="mt-1">Such content results in immediate account action.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">15. Privacy</h2>
            <p className="mb-1">Battle Crown stores: Email, Game UID, IGN, Match History, and Crown History.</p>
            <p>Data is used only for tournament operations. Battle Crown does not sell user personal information to third parties.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">16. Limitation of Liability</h2>
            <p>Battle Crown is not responsible for game server outages, publisher issues, device failures, internet failures, or force majeure events.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">17. Changes to Rules</h2>
            <p>Battle Crown may update these rules without prior notice. Continued use of the platform means acceptance of updated rules.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">18. Final Decision</h2>
            <p>All tournament-related decisions made by Battle Crown Admins are final and binding. Admin decisions are based on available evidence and verification results. Players may contact support for clarification regarding decisions.</p>
          </section>

          <section>
            <h2 className="text-yellow-400 font-bold mb-2">19. Acceptance</h2>
            <p>By joining any Battle Crown tournament, you acknowledge that you have read, understood, and agreed to these Rules & Regulations.</p>
          </section>

          <section className="border-t border-gray-800 pt-4">
            <h2 className="text-orange-400 font-bold mb-2">⚠️ Important Disclaimer</h2>
            <p>
              Battle Crown is an independent esports tournament platform and is not affiliated with, endorsed by, or sponsored by Krafton, PUBG/BGMI, Garena, Free Fire, Google, Apple, or any game publisher. All game names, logos, and trademarks belong to their respective owners.
            </p>
          </section>

        </div>

      </div>
    </main>
  );
}