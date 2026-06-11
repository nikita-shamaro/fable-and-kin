import Link from "next/link";

export default function Home() {
  return (
    <main
      className="min-h-[100dvh] bg-cream flex flex-col items-center justify-center px-6 text-center"
      style={{ fontFamily: "var(--font-plus-jakarta), sans-serif" }}
    >
      <p
        className="text-muted tracking-widest uppercase"
        style={{
          fontFamily: "var(--font-fraunces), serif",
          fontWeight: 300,
          fontSize: "0.75rem",
          letterSpacing: "0.2em",
          marginBottom: "14px",
        }}
      >
        Speak your language
      </p>

      <h1
        className="text-ink leading-tight"
        style={{
          fontFamily: "var(--font-fraunces), serif",
          fontWeight: 300,
          fontSize: "clamp(2.5rem, 8vw, 4rem)",
          marginBottom: "18px",
        }}
      >
        Fable &amp; Kin
      </h1>

      <p className="text-muted max-w-md" style={{ fontSize: "1.05rem", marginBottom: "12px" }}>
        Сказки, в которых живёт имя вашего ребёнка — на родном языке вашей семьи.
      </p>

      {/* Amber divider */}
      <div
        style={{
          width: "48px",
          height: "1px",
          backgroundColor: "#C47B45",
          opacity: 0.6,
          margin: "20px 0 36px",
        }}
      />

      <Link
        href="/start"
        className="px-8 py-3.5 rounded-full text-sm font-medium tracking-wide transition-all active:scale-95 hover:opacity-90"
        style={{ backgroundColor: "#C47B45", color: "#F7F0E6" }}
      >
        Создать сказку
      </Link>
    </main>
  );
}
