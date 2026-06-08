"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import storyData from "@/data/story.json";

const CHILD_NAME = "Олег";

function replaceName(text: string, name: string, placeholder: string): string {
  return text.split(placeholder).join(name);
}

type AudioState = "idle" | "loading" | "playing" | "paused" | "error";

export default function ReaderPage() {
  const [currentPage, setCurrentPage] = useState(0);
  const [audioState, setAudioState] = useState<AudioState>("idle");

  // Cache blob URLs so we don't re-fetch audio for pages already visited
  const audioCache = useRef<Map<number, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const pages = storyData.pages;
  const totalPages = pages.length;
  const page = pages[currentPage];
  const text = replaceName(page.text, CHILD_NAME, storyData.namePlaceholder);

  // Stop audio and reset state when page changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioState("idle");
  }, [currentPage]);

  const handlePlayPause = useCallback(async () => {
    // If already playing — pause
    if (audioState === "playing" && audioRef.current) {
      audioRef.current.pause();
      setAudioState("paused");
      return;
    }

    // If paused — resume
    if (audioState === "paused" && audioRef.current) {
      audioRef.current.play();
      setAudioState("playing");
      return;
    }

    // Otherwise fetch audio (or use cache) and play
    setAudioState("loading");

    try {
      let blobUrl = audioCache.current.get(currentPage);

      if (!blobUrl) {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);

        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        audioCache.current.set(currentPage, blobUrl);
      }

      const audio = new Audio(blobUrl);
      audioRef.current = audio;

      audio.onended = () => setAudioState("idle");
      audio.onerror = () => setAudioState("error");

      await audio.play();
      setAudioState("playing");
    } catch (err) {
      console.error("TTS error:", err);
      setAudioState("error");
    }
  }, [audioState, currentPage, text]);

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
      if (e.key === " ") { e.preventDefault(); handlePlayPause(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, handlePlayPause]);

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
        <span className="text-sm text-muted">
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
          className="text-center text-ink leading-relaxed max-w-xl mx-auto mb-10"
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontWeight: 300,
            fontSize: "clamp(1.25rem, 4vw, 1.75rem)",
          }}
        >
          {text}
        </p>

        {/* Play / Pause button */}
        <button
          onClick={handlePlayPause}
          disabled={audioState === "loading"}
          aria-label={audioState === "playing" ? "Пауза" : "Слушать"}
          className="flex items-center gap-2.5 px-6 py-3 rounded-full border transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
            border-amber text-amber hover:bg-amber hover:text-cream active:scale-95"
        >
          {audioState === "loading" && (
            <>
              <LoadingSpinner />
              <span className="text-sm font-medium">Загрузка…</span>
            </>
          )}
          {audioState === "playing" && (
            <>
              <PauseIcon />
              <span className="text-sm font-medium">Пауза</span>
            </>
          )}
          {(audioState === "idle" || audioState === "paused") && (
            <>
              <PlayIcon />
              <span className="text-sm font-medium">
                {audioState === "paused" ? "Продолжить" : "Слушать"}
              </span>
            </>
          )}
          {audioState === "error" && (
            <>
              <PlayIcon />
              <span className="text-sm font-medium">Повторить</span>
            </>
          )}
        </button>

        {audioState === "error" && (
          <p className="mt-3 text-xs text-muted">Не удалось загрузить аудио. Проверьте ключ API.</p>
        )}
      </main>

      {/* Navigation */}
      <nav className="flex items-center justify-center gap-6 px-6 py-8 border-t border-border">
        <button
          onClick={goPrev}
          disabled={isFirst}
          aria-label="Предыдущая страница"
          className="w-12 h-12 rounded-full border border-border flex items-center justify-center transition-all
            disabled:opacity-25 disabled:cursor-not-allowed
            hover:border-amber hover:text-amber hover:bg-amber/5
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
            hover:border-amber hover:text-amber hover:bg-amber/5
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

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3 2.5l10 5.5-10 5.5V2.5z"/>
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="3" y="2" width="4" height="12" rx="1"/>
      <rect x="9" y="2" width="4" height="12" rx="1"/>
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round"/>
    </svg>
  );
}
