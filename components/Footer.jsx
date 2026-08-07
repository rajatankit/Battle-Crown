export default function Footer() {
  return (
    <footer className="bg-[#0f141c] border-t border-gray-800 text-gray-400 py-8 mt-10">
      <div className="max-w-6xl mx-auto px-6">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Brand */}
          <div>
            <h2 className="text-xl font-bold text-cyan-400">
              BATTLE CROWN
            </h2>
            <p className="text-sm mt-2">
              Skill-based esports tournament platform.
            </p>
          </div>


          {/* Legal */}
          <div>
            <h3 className="text-white font-bold mb-3">
              Legal
            </h3>

            <ul className="space-y-2 text-sm">
              <li>
                <a href="/rules" className="hover:text-cyan-400">
                  Rules & Regulations
                </a>
              </li>

              <li>
                <a href="/terms" className="hover:text-cyan-400">
                  Terms & Conditions
                </a>
              </li>

              <li>
                <a href="/privacy-policy" className="hover:text-cyan-400">
                  Privacy Policy
                </a>
              </li>

              <li>
                <a href="/refund-policy" className="hover:text-cyan-400">
                  Refund Policy
                </a>
              </li>
            </ul>

          </div>


          {/* Support */}
          <div>
            <h3 className="text-white font-bold mb-3">
              Support
            </h3>

            <p className="text-sm">
              Contact us for tournament or payment related queries.
            </p>

            <a 
              href="/contact"
              className="inline-block mt-3 text-cyan-400 hover:underline"
            >
              Contact Us
            </a>

          </div>

        </div>


        <div className="border-t border-gray-800 mt-8 pt-5 text-center text-xs">
          © 2026 Battle Crown. All Rights Reserved.
        </div>


      </div>
    </footer>
  );
}