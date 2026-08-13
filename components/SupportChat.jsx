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

    <div className="fixed bottom-24 right-4 sm:bottom-6 sm:right-5 z-50">

      {!isOpen ? (
       <button
  onClick={() => setIsOpen(true)}
  aria-label="Open Rovit AI"
  title="Rovit AI"
  className="
    group relative
    w-12 h-12
    rounded-full
    flex items-center justify-center
    bg-[#101722]/95
    backdrop-blur-xl
    border border-cyan-400/30
    text-cyan-300
    shadow-[0_8px_30px_rgba(0,0,0,0.45)]
    transition-all duration-300
    hover:border-cyan-400/70
    hover:bg-[#141d2a]
    hover:text-cyan-200
    hover:-translate-y-0.5
    hover:shadow-[0_8px_30px_rgba(34,211,238,0.18)]
    active:scale-95
  "
>
  {/* Soft hover glow */}
  <span
    className="
      absolute inset-0 rounded-full
      bg-cyan-400/10
      blur-md
      opacity-0
      group-hover:opacity-100
      transition-opacity
    "
  />

  {/* Message icon */}
  <svg
    className="relative z-10"
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M20 11.5C20 15.642 16.418 19 12 19C10.9 19 9.85 18.79 8.92 18.41L5 20L6.35 16.55C5.5 15.35 5 13.95 5 12.5C5 8.358 8.582 5 13 5C17.418 5 20 7.358 20 11.5Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    <path
      d="M9 12H9.01M12 12H12.01M15 12H15.01"
      stroke="#22D3EE"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>

          <span className="relative z-10 flex flex-col items-start leading-none">
            <span className="text-[11px] font-black tracking-wide">
            
            </span>
            <span className="text-[8px] text-gray-500 mt-1 tracking-wider uppercase">
             
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
      d="M20 11.5C20 15.642 16.418 19 12 19C10.7 19 9.48 18.7 8.4 18.15L4 20L5.3 16.1C4.48 14.82 4 13.2 4 11.5C4 7.358 7.582 4 12 4C16.418 4 20 7.358 20 11.5Z"
      stroke="#22D3EE"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 11.5H8.51M12 11.5H12.01M15.5 11.5H15.51"
      stroke="#22D3EE"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
</div>

              <div>
                <p className="font-black text-xs tracking-wide">
                  ROVIT
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
                ROVIT AI is typing...
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