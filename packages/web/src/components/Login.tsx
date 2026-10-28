"use client";
import { useState } from "react";
import { ArrowUpRight, Bot, LockKeyhole } from "lucide-react";
import { TOKEN_KEY } from "../lib/client";
export function Login({ onToken }: { onToken: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand-mark">
          <Bot size={26} />
        </div>
        <h1>AgentWatch</h1>
        <p>Ваш локальний простір для спостереження за агентами.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) {
              sessionStorage.setItem(TOKEN_KEY, value.trim());
              onToken(value.trim());
            }
          }}
        >
          <label htmlFor="local-token">Локальний ключ</label>
          <input
            id="local-token"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ключ із посилання у терміналі"
          />
          <button className="primary-button" type="submit">
            Відкрити офіс <ArrowUpRight size={16} />
          </button>
        </form>
        <p className="login-hint">
          Запустіть <code>pnpm agentwatch start</code> та відкрийте посилання з
          термінала.
        </p>
        <span className="privacy-note">
          <LockKeyhole size={12} /> Усе залишається на цьому Mac
        </span>
      </div>
    </div>
  );
}
