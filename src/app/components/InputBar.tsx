import { useState, FormEvent, useRef } from 'react';
import { Plus, Mic } from 'lucide-react';

interface InputBarProps {
  onAddIdea: (text: string, isCentral?: boolean) => void;
}

export function InputBar({ onAddIdea }: InputBarProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onAddIdea(input.trim(), false);
      setInput('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="app-input-bar w-full rounded-full bg-white/5 backdrop-blur-md border border-white/10 p-2 shadow-2xl">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <button
          type="submit"
          className="app-input-action flex-shrink-0 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 transition-colors border border-white/5"
        >
          <Plus size={20} />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Novo Insight..."
          className="app-input-field flex-1 bg-transparent border-none text-gray-300 placeholder-gray-500 text-sm focus:outline-none px-2"
        />

        <button
          type="button"
          className="app-input-action flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Mic size={20} />
        </button>
      </form>
    </div>
  );
}
