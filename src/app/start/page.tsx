"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Gender = "m" | "f";

const AGE_BANDS = [
  { id: "2-3", label: "2–3 года", available: false },
  { id: "4-6", label: "4–6 лет", available: true },
  { id: "7-9", label: "7–9 лет", available: false },
];

export default function StartPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("m");
  const [ageBand, setAgeBand] = useState("4-6");
  const [submitting, setSubmitting] = useState(false);

  // Single given name, first letter capitalised — it is spliced into
  // Russian sentences, so trailing words would break the grammar.
  const cleanName = (() => {
    const first = name.trim().split(/\s+/)[0] || "";
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
  })();

  const canSubmit = cleanName.length >= 2 && !submitting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    router.push(`/reader?name=${encodeURIComponent(cleanName)}&gender=${gender}`);
  };

  const fieldLabelStyle: React.CSSProperties = {
    fontFamily: "var(--font-fraunces), serif",
    fontWeight: 300,
    fontSize: "0.95rem",
    color: "#1C1612",
    marginBottom: "10px",
    display: "block",
  };

  return (
    <div
      className="min-h-[100dvh] bg-cream flex flex-col"
      style={{ fontFamily: "var(--font-plus-jakarta), sans-serif" }}
    >
      {/* Header */}
      <header className="px-6 py-4 border-b border-border">
        <span
          className="text-xl text-ink tracking-tight"
          style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 300 }}
        >
          Fable &amp; Kin
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-md"
          style={{
            backgroundColor: "#FFFFFF",
            border: "0.5px solid #E2D8CC",
            boxShadow: "0 2px 32px rgba(28, 22, 18, 0.06)",
            borderRadius: "16px",
            padding: "clamp(1.75rem, 5vw, 2.5rem)",
          }}
        >
          <p
            className="text-muted tracking-widest uppercase text-center"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontWeight: 300,
              fontSize: "0.7rem",
              letterSpacing: "0.2em",
              marginBottom: "10px",
            }}
          >
            Русские сказки
          </p>
          <h1
            className="text-ink text-center leading-tight"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontWeight: 300,
              fontSize: "clamp(1.5rem, 5vw, 1.9rem)",
              marginBottom: "8px",
            }}
          >
            Сказка про вашего ребёнка
          </h1>
          <p className="text-muted text-sm text-center" style={{ marginBottom: "28px" }}>
            Имя вашего ребёнка — в каждой строке и в голосе рассказчика.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div style={{ marginBottom: "24px" }}>
              <label htmlFor="child-name" style={fieldLabelStyle}>
                Имя ребёнка
              </label>
              <input
                id="child-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Олег"
                autoComplete="off"
                className="w-full rounded-xl border border-border bg-cream/40 px-4 py-3 text-ink outline-none transition-colors focus:border-amber"
                style={{ fontSize: "1rem" }}
              />
            </div>

            {/* Gender */}
            <div style={{ marginBottom: "24px" }}>
              <span style={fieldLabelStyle}>Кто герой сказки?</span>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "m", label: "Мальчик" },
                  { id: "f", label: "Девочка" },
                ] as { id: Gender; label: string }[]).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGender(g.id)}
                    className="rounded-xl px-4 py-3 text-sm font-medium transition-all active:scale-95"
                    style={
                      gender === g.id
                        ? { backgroundColor: "#C47B45", color: "#F7F0E6", border: "1px solid #C47B45" }
                        : { backgroundColor: "transparent", color: "#1C1612", border: "1px solid #E2D8CC" }
                    }
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Age band */}
            <div style={{ marginBottom: "32px" }}>
              <span style={fieldLabelStyle}>Возраст</span>
              <div className="grid grid-cols-3 gap-2">
                {AGE_BANDS.map((band) => (
                  <button
                    key={band.id}
                    type="button"
                    disabled={!band.available}
                    onClick={() => band.available && setAgeBand(band.id)}
                    className="rounded-xl px-2 py-3 text-sm font-medium transition-all active:scale-95 disabled:cursor-not-allowed"
                    style={
                      ageBand === band.id && band.available
                        ? { backgroundColor: "#C47B45", color: "#F7F0E6", border: "1px solid #C47B45" }
                        : band.available
                        ? { backgroundColor: "transparent", color: "#1C1612", border: "1px solid #E2D8CC" }
                        : { backgroundColor: "transparent", color: "#9B8878", border: "1px solid #E2D8CC", opacity: 0.55 }
                    }
                  >
                    {band.label}
                    {!band.available && (
                      <span className="block text-[10px] font-normal" style={{ color: "#9B8878" }}>
                        скоро
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full px-8 py-3.5 rounded-full text-sm font-medium tracking-wide transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#C47B45", color: "#F7F0E6", border: "none" }}
            >
              {submitting ? "Открываем сказку…" : "Создать сказку"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
