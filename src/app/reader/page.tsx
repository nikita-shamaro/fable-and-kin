"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import storyData from "@/data/story.json";
import timestampData from "@/data/timestamps.json";

const CHILD_NAME = "Олег";

function replaceName(text: string, name: string, placeholder: string): string {
  return text.split(placeholder).join(name);
}

type AudioState = "idle" | "loading" | "playing" | "paused" | "error";

interface WordTiming {
  word: string;
  start: number;
  end: number;
}

// Split display text into tokens on whitespace boundaries.
// Punctuation stays attached to its token (e.g. "птицы,").
function splitTokens(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

// Strip leading/trailing Cyrillic-text punctuation for word matching.
function bareWord(token: string): string {
  return token.replace(/^[«"'(—–]+|[»"').,!?:;—–]+$/g, "").toLowerCase();
}

// Map display tokens to Whisper word timings by sequential normalized matching.
// Returns an array parallel to tokens; unmatched tokens get null.
function buildTimingMap(
  tokens: string[],
  whisperWords: WordTiming[]
): Array<WordTiming | null> {
  const map: Array<WordTiming | null> = new Array(tokens.length).fill(null);
  let wi = 0;
  for (let ti = 0; ti < tokens.length; ti++) {
    const bare = bareWord(tokens[ti]);
    if (!bare) continue;
    while (wi < whisperWords.length) {
      const wBare = bareWord(whisperWords[wi].word);
      if (wBare === bare || bare.startsWith(wBare) || wBare.startsWith(bare)) {
        map[ti] = whisperWords[wi];
        wi++;
        break;
      }
      // Whisper split differently — advance whisper pointer and try next
      wi++;
    }
  }
  return map;
}

export default function ReaderPage() {
  const [currentPage, setCurrentPage] = useState(0);
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [activeWordIdx, setActiveWordIdx] = useState<number>(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoAdvancing = useRef(false);
  const timingMapRef = useRef<Array<WordTiming | null>>([]);
  const rafRef = useRef<number | null>(null);

  const pages = storyData.pages;
  const totalPages = pages.length;
  const page = pages[currentPage];
  const text = replaceName(page.text, CHILD_NAME, storyData.namePlaceholder);
  const tokens = useMemo(() => splitTokens(text), [text]);

  // Build timing map whenever page or tokens change
  useEffect(() => {
    const pageTimings = (timestampData.pages as { page: number; words: WordTiming[] }[])
      .find((p) => p.page === currentPage + 1);
    timingMapRef.current = pageTimings
      ? buildTimingMap(tokens, pageTimings.words)
      : new Array(tokens.length).fill(null);
    setActiveWordIdx(-1);
  }, [currentPage, tokens]);

  // Stop audio when the page changes (unless we're auto-advancing)
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (!autoAdvancing.current) {
      setAudioState("idle");
      setActiveWordIdx(-1);
    }
  }, [currentPage]);

  const fetchAudioUrl = useCallback(async (pageIndex: number, pageText: string): Promise<string> => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pageText, pageNumber: pageIndex + 1 }),
    });
    if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
    const { url } = await res.json();
    if (!url) throw new Error("No URL returned from TTS API");
    return url;
  }, []);

  const playPage = useCallback(async (pageIndex: number, pageText: string) => {
    setAudioState("loading");

    try {
      const url = await fetchAudioUrl(pageIndex, pageText);

      const audio = new Audio(url);
      audioRef.current = audio;

      // Poll audio.currentTime via rAF (~60fps) for precise highlight tracking.
      // timeupdate only fires ~4x/second, causing perceptible drift on longer pages.
      const tick = () => {
        const map = timingMapRef.current;
        const t = audio.currentTime;
        let idx = -1;
        for (let i = 0; i < map.length; i++) {
          if (map[i] && map[i]!.start <= t) idx = i;
        }
        setActiveWordIdx(idx);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      audio.onended = () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        setActiveWordIdx(-1);
        const isLastPage = pageIndex >= totalPages - 1;
        if (isLastPage) {
          autoAdvancing.current = false;
          setAudioState("idle");
        } else {
          autoAdvancing.current = true;
          setCurrentPage(pageIndex + 1);
        }
      };

      audio.onerror = () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        autoAdvancing.current = false;
        setAudioState("error");
        setActiveWordIdx(-1);
      };

      await audio.play();
      setAudioState("playing");
    } catch (err) {
      console.error("TTS error:", err);
      autoAdvancing.current = false;
      setAudioState("error");
    }
  }, [fetchAudioUrl, totalPages]);

  // When the page changes due to auto-advance, immediately play the new page
  useEffect(() => {
    if (autoAdvancing.current) {
      autoAdvancing.current = false;
      const pageText = replaceName(
        pages[currentPage].text,
        CHILD_NAME,
        storyData.namePlaceholder
      );
      playPage(currentPage, pageText);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const handlePlayPause = useCallback(async () => {
    if (audioState === "playing" && audioRef.current) {
      audioRef.current.pause();
      setAudioState("paused");
      return;
    }
    if (audioState === "paused" && audioRef.current) {
      audioRef.current.play();
      setAudioState("playing");
      return;
    }
    playPage(currentPage, text);
  }, [audioState, currentPage, text, playPage]);

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
  const hasTimings = timingMapRef.current.some(Boolean);

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

        {/* Story text — word spans when timings available, plain text otherwise */}
        <p
          className="text-center text-ink leading-relaxed max-w-xl mx-auto mb-10"
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontWeight: 300,
            fontSize: "clamp(1.25rem, 4vw, 1.75rem)",
          }}
        >
          {hasTimings ? (
            tokens.map((token, i) => (
              <span key={i}>
                <span
                  style={{
                    color: i === activeWordIdx ? "#C47B45" : "#1C1612",
                    transition: "color 350ms ease",
                  }}
                >
                  {token}
                </span>
                {i < tokens.length - 1 ? " " : ""}
              </span>
            ))
          ) : (
            text
          )}
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
          <p className="mt-3 text-xs text-muted">Не удалось загрузить аудио. Проверьте настройки.</p>
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
