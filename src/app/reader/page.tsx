"use client";

import { useState, useCallback, useEffect } from "react";
import storyData from "@/data/story.json";

const CHILD_NAME = "Олег";

function replaceName(text: string, name: string, placeholder: string): string {
  return text.split(placeholder).join(name);
}

export default function ReaderPage() {
  const [currentPage, setCurrentPage] = useState(0);

  const pages = storyData.pages;
  const totalPages = pages.length;
  const page = pages[currentPage];
  const text = replaceName(page.text, CHILD_NAME, storyData.namePlaceholder);

  const goNext = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, totalPages - 1));
  }, [totalPages]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(p - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  const isFirst = currentPage === 0;
  const isLast = currentPage === totalPages - 1;

  return (
    <div className="min-h-screen bg-cream flex flex-col" style={{ fontFamily: "var(--font-plus-jakarta), sans-serif" }}>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <span
          className="text-xl text-ink tracking-tight"
          style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 300 }}
        >
          Fable &amp; Kin
        </span>
        <span className="text-sm text-muted font-ui">
          {currentPage + 1} / {totalPages}
        </span>
      </header>

      {/* Main reading area */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Page number pill */}
        <div className="mb-8">
          <span className="text-xs font-medium tracking-widest uppercase text-amber px-4 py-1.5 rounded-full border border-amber/30 bg-amber/5">
            Страница {currentPage + 1}
          </span>
        </div>

        {/* Story text */}
        <p
          className="text-center text-ink leading-relaxed max-w-xl mx-auto"
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontWeight: 300,
            fontSize: "clamp(1.25rem, 4vw, 1.75rem)",
          }}
        >
          {text}
        </p>
      </main>

      {/* Navigation */}
      <nav className="flex items-center justify-center gap-6 px-6 py-8 border-t border-border">
        <button
          onClick={goPrev}
          disabled={isFirst}
          aria-label="Предыдущая страница"
          className="w-12 h-12 rounded-full border border-border flex items-center justify-center transition-all
            disabled:opacity-25 disabled:cursor-not-allowed
            hover:not-disabled:border-amber hover:not-disabled:text-amber hover:not-disabled:bg-amber/5
            active:scale-95 text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-2">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i)}
              aria-label={`Страница ${i + 1}`}
              className={`rounded-full transition-all ${
                i === currentPage
                  ? "w-6 h-2 bg-amber"
                  : "w-2 h-2 bg-border hover:bg-muted"
              }`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={isLast}
          aria-label="Следующая страница"
          className="w-12 h-12 rounded-full border border-border flex items-center justify-center transition-all
            disabled:opacity-25 disabled:cursor-not-allowed
            hover:not-disabled:border-amber hover:not-disabled:text-amber hover:not-disabled:bg-amber/5
            active:scale-95 text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </nav>
    </div>
  );
}
