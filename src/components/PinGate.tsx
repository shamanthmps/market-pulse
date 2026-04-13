"use client";
import { useState, useEffect, useRef } from "react";
import { TrendingUp } from "lucide-react";

// ── PIN Configuration ─────────────────────────────────────────────────────────
// To change the PIN:
//   1. Run this in browser console: crypto.subtle.digest("SHA-256", new TextEncoder().encode("YOUR_NEW_PIN"))
//      .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")))
//   2. Replace PIN_HASH below with the output.
// Current PIN: 1122
const PIN_HASH =
  "b3282a2f2a28757b3a18ab833de16a9c54518c0b0cf493e3f0a7cf09386f326a";
const STORAGE_KEY = "mp-gate-v1";

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!PIN_HASH) {
      setUnlocked(true);
      return;
    }
    setUnlocked(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  // Auto-submit when all 4 digits filled
  useEffect(() => {
    if (digits.every((d) => d !== "")) {
      verify(digits.join(""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  async function verify(pin: string) {
    const hash = await sha256(pin);
    if (hash === PIN_HASH) {
      localStorage.setItem(STORAGE_KEY, "1");
      setUnlocked(true);
    } else {
      setError(true);
      setShake(true);
      setDigits(["", "", "", ""]);
      setTimeout(() => {
        setShake(false);
        setError(false);
        inputRefs.current[0]?.focus();
      }, 700);
    }
  }

  function handleKey(index: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  // Still checking localStorage
  if (unlocked === null) return null;

  // Already unlocked
  if (unlocked) return <>{children}</>;

  // PIN gate screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex flex-col items-center gap-4 mb-10">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-900/60">
          <TrendingUp className="w-8 h-8 text-white" />
        </div>
        <div className="text-center">
          <p className="text-white text-xl font-bold tracking-tight">
            Market Pulse
          </p>
          <p className="text-slate-400 text-sm mt-1">Enter PIN to continue</p>
        </div>
      </div>

      {/* PIN dots */}
      <div
        className={`flex gap-4 mb-8 transition-transform ${shake ? "animate-[wiggle_0.6s_ease-in-out]" : ""}`}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={d}
            autoFocus={i === 0}
            onChange={(e) => handleKey(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`w-14 h-14 rounded-2xl text-center text-2xl font-bold outline-none transition-all
              ${error ? "bg-red-900/40 border-2 border-red-500 text-red-300" : "bg-slate-800 border-2 border-slate-700 text-white focus:border-indigo-500 focus:bg-slate-700"}
            `}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm font-medium">Incorrect PIN</p>
      )}

      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-10px); }
          30%       { transform: translateX(10px); }
          45%       { transform: translateX(-8px); }
          60%       { transform: translateX(8px); }
          75%       { transform: translateX(-4px); }
          90%       { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
