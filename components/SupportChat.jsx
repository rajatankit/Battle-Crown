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
        body: JSON.stringify({ messages: [...messages, { role: 'user', content: userMessage }] }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error ho gaya hai.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition"
        >
          💬 Support AI
        </button>
      ) : (
        <div className="w-80 h-96 bg-gray-900 border border-gray-700 rounded-lg shadow-xl flex flex-col text-white">
          <div className="bg-gray-800 p-3 flex justify-between items-center rounded-t-lg">
            <span className="font-bold text-sm">Customer Support Bot</span>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">✕</button>
          </div>
          <div className="flex-1 p-3 overflow-y-auto space-y-2 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={`p-2 rounded max-w-[80%] ${m.role === 'user' ? 'bg-indigo-600 ml-auto' : 'bg-gray-700'}`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="text-gray-400 text-xs">Typing...</div>}
          </div>
          <form onSubmit={sendMessage} className="p-2 border-t border-gray-700 flex">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Kuch puchein..."
              className="flex-1 bg-gray-800 border border-gray-700 p-2 rounded text-sm text-white focus:outline-none"
            />
            <button type="submit" className="ml-2 bg-indigo-600 px-3 py-2 rounded text-sm hover:bg-indigo-700">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}