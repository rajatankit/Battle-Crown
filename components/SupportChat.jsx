'use client';
import { useState } from 'react';

export default function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! Main aapki kya madad kar sakta hoon tournament ya matches ke baare mein?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }]
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Connection error ho gaya hai.' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">

      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open Support AI"
          className="
            group relative
            flex items-center gap-2.5
            px-4 py-2.5
            rounded-full
            bg-[#101722]/95
            backdrop-blur-xl
            border border-cyan-400/25
            text-white
            shadow-[0_8px_30px_rgba(0,0,0,0.45)]
            transition-all duration-300
            hover:border-cyan-400/60
            hover:bg-[#141d2a]
            hover:-translate-y-0.5
            active:scale-95
          "
        >
          {/* Soft glow */}
          <span
            className="
              absolute inset-0 rounded-full
              bg-cyan-400/5
              blur-md
              opacity-0
              group-hover:opacity-100
              transition-opacity
            "
          />

          {/* Professional AI icon */}
          <span
            className="
              relative z-10
              w-8 h-8
              rounded-full
              flex items-center justify-center
              bg-[#182330]
              border border-cyan-400/30
              shadow-inner
            "
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7 10.5C7 7.462 9.462 5 12.5 5C15.538 5 18 7.462 18 10.5V13.5C18 16.538 15.538 19 12.5 19H10L7 21V17.2C6.37 16.25 6 15.12 6 13.9V10.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 11.5H9.51M12.5 11.5H12.51M15.5 11.5H15.51"
                stroke="#22D3EE"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <span className="relative z-10 flex flex-col items-start leading-none">
            <span className="text-[11px] font-black tracking-wide">
              SUPPORT AI
            </span>
            <span className="text-[8px] text-gray-500 mt-1 tracking-wider uppercase">
              Always Online
            </span>
          </span>

          {/* Online indicator */}
          <span className="relative z-10 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        </button>
      ) : (
        <div
          className="
            w-80 h-96
            bg-[#0c121c]/98
            backdrop-blur-xl
            border border-cyan-400/20
            rounded-2xl
            shadow-[0_15px_50px_rgba(0,0,0,0.6)]
            flex flex-col
            text-white
            overflow-hidden
          "
        >
          {/* Header */}
          <div className="bg-[#111925] px-4 py-3 flex justify-between items-center border-b border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#182330] border border-cyan-400/30 flex items-center justify-center">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 10.5C7 7.462 9.462 5 12.5 5C15.538 5 18 7.462 18 10.5V13.5C18 16.538 15.538 19 12.5 19H10L7 21V17.2C6.37 16.25 6 15.12 6 13.9V10.5"
                    stroke="#22D3EE"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div>
                <p className="font-black text-xs tracking-wide">
                  SUPPORT AI
                </p>
                <p className="text-[9px] text-emerald-400 mt-0.5">
                  ● Online
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-white transition text-lg"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2 text-sm">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`
                  p-2.5 rounded-xl max-w-[80%]
                  border
                  ${
                    m.role === 'user'
                      ? 'bg-cyan-400/10 border-cyan-400/20 text-cyan-50 ml-auto'
                      : 'bg-[#151d29] border-gray-800 text-gray-200'
                  }
                `}
              >
                {m.content}
              </div>
            ))}

            {loading && (
              <div className="text-gray-500 text-xs px-1">
                Support AI is typing...
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={sendMessage}
            className="p-2.5 border-t border-gray-800 flex bg-[#0e151f]"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Kuch puchein..."
              className="
                flex-1
                bg-[#151d29]
                border border-gray-800
                p-2.5
                rounded-lg
                text-sm text-white
                placeholder:text-gray-600
                focus:outline-none
                focus:border-cyan-400/40
              "
            />

            <button
              type="submit"
              className="
                ml-2
                bg-cyan-400
                text-black
                px-3
                rounded-lg
                text-xs
                font-black
                hover:bg-cyan-300
                transition
              "
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}