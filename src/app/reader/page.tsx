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

// Split text into sentences at ". ", "— ", and "«" boundaries.
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=\. )|(?=— )|(?=«)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Build token-index ranges for each sentence: { start, end } (end exclusive).
function buildSentenceRanges(sentences: string[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const s of sentences) {
    const count = splitTokens(s).length;
    ranges.push({ start: cursor, end: cursor + count });
    cursor += count;
  }
  return ranges;
}

// Find the index of the last Whisper word whose start time is <= scaledT.
// Pure timestamp lookup — no string matching, never gets stuck on text mismatches.
function activeIndexAt(words: WordTiming[], scaledT: number): number {
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= scaledT) idx = i;
  }
  return idx;
}

export default function ReaderPage() {
  const [currentPage, setCurrentPage] = useState(-1); // -1 = cover
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [activeWordIdx, setActiveWordIdx] = useState<number>(-1);
  const [pageVisible, setPageVisible] = useState(true);
  // 'idle' | 'exiting' | 'entering-prep' | 'entering'
  const [curtainPhase, setCurtainPhase] = useState<"idle" | "exiting" | "entering-prep" | "entering">("idle");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoAdvancing = useRef(false);
  const whisperWordsRef = useRef<WordTiming[]>([]);
  const rafRef = useRef<number | null>(null);
  const whisperDurationRef = useRef<number>(0);
  const lastLogTimeRef = useRef<number>(0);
  const pendingPageRef = useRef<number | null>(null);

  // Fade out → swap page → fade in. Used for all navigation.
  const navigateToPage = useCallback((n: number) => {
    pendingPageRef.current = n;
    setPageVisible(false);
  }, []);

  useEffect(() => {
    if (pageVisible) return;
    if (pendingPageRef.current === null) return;
    const t = setTimeout(() => {
      setCurrentPage(pendingPageRef.current!);
      pendingPageRef.current = null;
      setPageVisible(true);
    }, 200);
    return () => clearTimeout(t);
  }, [pageVisible]);

  // Theatrical curtain-rise transition (cover→story, story→end, end→cover).
  // Phase sequence: exiting (500ms) → 100ms pause → entering-prep (instant paint)
  // → entering (500ms) → idle.
  const startCurtain = useCallback((targetPage: number) => {
    setCurtainPhase("exiting");
    const t1 = setTimeout(() => {
      setCurrentPage(targetPage);
      setCurtainPhase("entering-prep");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCurtainPhase("entering");
          setTimeout(() => setCurtainPhase("idle"), 500);
        });
      });
    }, 600); // 500ms exit + 100ms pause
    return () => clearTimeout(t1);
  }, []);

  const pages = storyData.pages;
  const totalPages = pages.length;
  const isCover = currentPage === -1;
  const isEnd = currentPage === totalPages;
  const page = (isCover || isEnd) ? null : pages[currentPage];
  const text = page ? replaceName(page.text, CHILD_NAME, storyData.namePlaceholder) : "";
  const tokens = useMemo(() => splitTokens(text), [text]);

  const sentenceRanges = useMemo(() => {
    const sentences = splitIntoSentences(text);
    return buildSentenceRanges(sentences);
  }, [text]);

  const activeSentenceIdx = useMemo(() => {
    if (activeWordIdx < 0) return -1;
    return sentenceRanges.findIndex(
      (r) => activeWordIdx >= r.start && activeWordIdx < r.end
    );
  }, [activeWordIdx, sentenceRanges]);

  // Load Whisper words for the current page
  useEffect(() => {
    if (currentPage < 0 || currentPage >= totalPages) return;
    const pageTimings = (timestampData.pages as { page: number; words: WordTiming[] }[])
      .find((p) => p.page === currentPage + 1);
    if (pageTimings && pageTimings.words.length > 0) {
      whisperWordsRef.current = pageTimings.words;
      whisperDurationRef.current = Math.max(...pageTimings.words.map((w) => w.end));
      console.log(`[highlight] page ${currentPage + 1} — whisper duration: ${whisperDurationRef.current.toFixed(3)}s, ${pageTimings.words.length} words`);
      console.log("[highlight] first 3 whisper words:", pageTimings.words.slice(0, 3));
    } else {
      whisperWordsRef.current = [];
      whisperDurationRef.current = 0;
    }
    setActiveWordIdx(-1);
  }, [currentPage]);

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

      audio.addEventListener("loadedmetadata", () => {
        console.log(`[highlight] audio duration: ${audio.duration.toFixed(3)}s, whisper duration: ${whisperDurationRef.current.toFixed(3)}s, ratio: ${(audio.duration / (whisperDurationRef.current || 1)).toFixed(4)}`);
      });

      lastLogTimeRef.current = 0;

      // Poll at ~60fps via rAF. Scale currentTime proportionally onto the
      // Whisper timeline so duration mismatches between ElevenLabs and Whisper
      // are corrected, then look up the active word purely by timestamp.
      const tick = () => {
        const words = whisperWordsRef.current;
        const actualDuration = audio.duration;
        const whisperDuration = whisperDurationRef.current;

        const scaledT =
          actualDuration > 0 && whisperDuration > 0
            ? (audio.currentTime / actualDuration) * whisperDuration
            : audio.currentTime;

        setActiveWordIdx(activeIndexAt(words, scaledT));

        const now = performance.now();
        if (now - lastLogTimeRef.current >= 500) {
          console.log(`[highlight] currentTime: ${audio.currentTime.toFixed(3)}s  scaledT: ${scaledT.toFixed(3)}s  activeWord: ${activeIndexAt(words, scaledT)}`);
          lastLogTimeRef.current = now;
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      audio.onended = () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        setActiveWordIdx(-1);
        const isLastPage = pageIndex >= totalPages - 1;
        if (isLastPage) {
          setAudioState("idle");
          startCurtain(totalPages);
        } else {
          autoAdvancing.current = true;
          navigateToPage(pageIndex + 1);
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
  }, [fetchAudioUrl, totalPages, navigateToPage, startCurtain]);

  // When the page changes due to auto-advance, immediately play the new page
  useEffect(() => {
    if (autoAdvancing.current && currentPage >= 0 && currentPage < totalPages) {
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
    if (isCover || isEnd) return;
    if (currentPage === totalPages - 1) { startCurtain(totalPages); return; }
    navigateToPage(currentPage + 1);
  }, [isCover, isEnd, currentPage, totalPages, navigateToPage, startCurtain]);

  const goPrev = useCallback(() => {
    if (isCover || isEnd) return;
    const prev = Math.max(currentPage - 1, 0);
    if (prev !== currentPage) navigateToPage(prev);
  }, [isCover, isEnd, currentPage, navigateToPage]);

  // Keyboard navigation (disabled on cover)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isCover || isEnd) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goPrev();
      if (e.key === " ") { e.preventDefault(); handlePlayPause(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isCover, goNext, goPrev, handlePlayPause]);

  const isFirst = currentPage === 0;
  const isLast = isEnd;
  const hasTimings = !isCover && !isEnd && whisperWordsRef.current.length > 0;

  return (
    <div className="min-h-screen bg-cream flex flex-col" style={{ fontFamily: "var(--font-plus-jakarta), sans-serif" }}>

      {/* Header */}
      <header className="grid px-6 py-4 border-b border-border" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
        <span
          className="text-xl text-ink tracking-tight self-center"
          style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 300 }}
        >
          Fable &amp; Kin
        </span>
        <span
          className="self-center text-center"
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontWeight: 300,
            fontSize: "0.75rem",
            color: "#9B8878",
          }}
        >
          {(!isCover && !isEnd) ? replaceName(storyData.title, CHILD_NAME, storyData.namePlaceholder) : ""}
        </span>
        <span className="text-sm text-muted self-center text-right">
          {(!isCover && !isEnd) ? `${currentPage + 1} / ${totalPages}` : ""}
        </span>
      </header>

      {/* Main reading area */}
      <main
        className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-8 sm:py-12"
        style={
          curtainPhase === "exiting"
            ? { opacity: 0, transform: "translateY(60px)", transition: "opacity 500ms ease-in, transform 500ms ease-in" }
            : curtainPhase === "entering-prep"
            ? { opacity: 0, transform: "translateY(-30px)", transition: "none" }
            : curtainPhase === "entering"
            ? { opacity: 1, transform: "translateY(0)", transition: "opacity 500ms ease-out, transform 500ms ease-out" }
            : {
                opacity: pageVisible ? 1 : 0,
                transform: pageVisible ? "scale(1)" : "scale(0.98)",
                transition: "opacity 200ms ease, transform 200ms ease",
              }
        }
      >
        {/* Page card */}
        <div
          className="w-full max-w-xl flex flex-col items-center"
          style={{
            backgroundColor: "#FFFFFF",
            border: "0.5px solid #E2D8CC",
            boxShadow: "0 2px 32px rgba(28, 22, 18, 0.06)",
            borderRadius: "16px",
            padding: "clamp(2rem, 6vw, 3.5rem) clamp(1.5rem, 5vw, 3rem)",
          }}
        >

        {isEnd ? (
          /* ── Completion screen ── */
          <div className="flex flex-col items-center text-center w-full">
            <p
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontWeight: 300,
                fontStyle: "italic",
                fontSize: "clamp(2.25rem, 8vw, 3rem)",
                color: "#C47B45",
                marginBottom: "20px",
                lineHeight: 1,
              }}
            >
              Конец
            </p>

            {/* Spark / feather motif */}
            <svg
              width="40" height="40" viewBox="0 0 40 40" fill="none"
              aria-hidden
              style={{ marginBottom: "16px" }}
            >
              {/* Central stem */}
              <path d="M20 34 C20 34 19 24 20 8" stroke="#C47B45" strokeWidth="1.2" strokeLinecap="round"/>
              {/* Left barbs */}
              <path d="M20 14 C16 11 13 12 11 10" stroke="#C47B45" strokeWidth="1" strokeLinecap="round"/>
              <path d="M20 18 C15 15 12 17 9 16" stroke="#C47B45" strokeWidth="1" strokeLinecap="round"/>
              <path d="M20 22 C16 20 13 22 11 22" stroke="#C47B45" strokeWidth="1" strokeLinecap="round"/>
              <path d="M20 26 C17 25 15 27 13 27" stroke="#C47B45" strokeWidth="1" strokeLinecap="round"/>
              {/* Right barbs */}
              <path d="M20 14 C24 11 27 12 29 10" stroke="#C47B45" strokeWidth="1" strokeLinecap="round"/>
              <path d="M20 18 C25 15 28 17 31 16" stroke="#C47B45" strokeWidth="1" strokeLinecap="round"/>
              <path d="M20 22 C24 20 27 22 29 22" stroke="#C47B45" strokeWidth="1" strokeLinecap="round"/>
              <path d="M20 26 C23 25 25 27 27 27" stroke="#C47B45" strokeWidth="1" strokeLinecap="round"/>
              {/* Tip */}
              <path d="M20 8 C20 8 19 5 20 4 C21 5 20 8 20 8" stroke="#C47B45" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>

            <p
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontWeight: 300,
                fontSize: "clamp(0.875rem, 2.5vw, 1rem)",
                color: "#9B8878",
                marginBottom: "20px",
              }}
            >
              {replaceName(storyData.title, CHILD_NAME, storyData.namePlaceholder)}
            </p>

            {/* Amber divider */}
            <div
              style={{
                width: "40px",
                height: "1px",
                backgroundColor: "#C47B45",
                opacity: 0.5,
                marginBottom: "32px",
              }}
            />

            <div className="flex items-center gap-3">
              {/* Читать снова — solid amber */}
              <button
                onClick={() => startCurtain(-1)}
                className="px-6 py-2.5 rounded-full text-sm font-medium tracking-wide transition-all active:scale-95"
                style={{ backgroundColor: "#C47B45", color: "#F7F0E6", border: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Читать снова
              </button>

              {/* В библиотеку — amber outline */}
              <button
                disabled
                className="px-6 py-2.5 rounded-full text-sm font-medium tracking-wide opacity-50 cursor-not-allowed"
                style={{ backgroundColor: "transparent", color: "#C47B45", border: "1.5px solid #C47B45" }}
              >
                В библиотеку
              </button>
            </div>
          </div>
        ) : isCover ? (
          /* ── Cover page ── */
          <div className="flex flex-col items-center text-center w-full">
            <p
              className="text-muted mb-3 tracking-widest uppercase"
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontWeight: 300,
                fontSize: "clamp(0.7rem, 2vw, 0.85rem)",
                letterSpacing: "0.2em",
              }}
            >
              Русские сказки
            </p>

            <h1
              className="text-ink mb-8 leading-tight"
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontWeight: 300,
                fontSize: "clamp(1.75rem, 6vw, 2.75rem)",
              }}
            >
              {replaceName(storyData.title, CHILD_NAME, storyData.namePlaceholder)}
            </h1>

            {/* Amber divider */}
            <div
              className="mb-10"
              style={{
                width: "48px",
                height: "1px",
                backgroundColor: "#C47B45",
                opacity: 0.6,
              }}
            />

            <button
              onClick={() => startCurtain(0)}
              className="px-8 py-3 rounded-full text-sm font-medium tracking-wide transition-all active:scale-95"
              style={{
                backgroundColor: "#C47B45",
                color: "#F7F0E6",
                border: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Начать читать
            </button>
          </div>
        ) : (
          /* ── Story pages ── */
          <>

            {/* Story text */}
            <p
              className="text-center text-ink leading-relaxed max-w-xl mx-auto mb-10"
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontWeight: 300,
                fontSize: "clamp(1.25rem, 4vw, 1.75rem)",
              }}
            >
              {hasTimings ? (
                sentenceRanges.map((range, sIdx) => {
                  const isActiveSentence = sIdx === activeSentenceIdx;
                  return (
                    <span
                      key={sIdx}
                      style={{
                        backgroundColor: isActiveSentence
                          ? "rgba(244, 212, 176, 0.5)"
                          : "transparent",
                        borderRadius: "12px",
                        padding: "4px 8px",
                        transition: isActiveSentence
                          ? "background-color 200ms ease"
                          : "background-color 300ms ease",
                        display: "inline",
                        boxDecorationBreak: "clone",
                        WebkitBoxDecorationBreak: "clone",
                      } as React.CSSProperties}
                    >
                      {range.start > 0 ? " " : ""}
                      {tokens.slice(range.start, range.end).map((token, localIdx) => {
                        const globalIdx = range.start + localIdx;
                        const isActive = globalIdx === activeWordIdx;
                        return (
                          <span key={globalIdx}>
                            <span
                              style={{
                                backgroundColor: isActive ? "#C47B45" : "transparent",
                                color: isActive ? "#F7F0E6" : "#1C1612",
                                borderRadius: "4px",
                                padding: "1px 4px",
                                transition: isActive
                                  ? "background-color 200ms ease, color 200ms ease"
                                  : "background-color 350ms ease, color 350ms ease",
                              }}
                            >
                              {token.includes("—")
                                ? token.split(/(—)/).map((part, pi) =>
                                    part === "—"
                                      ? <span key={pi} style={{ fontSize: "0.85em", color: isActive ? "#F7F0E6" : "#9B8878" }}>—</span>
                                      : part
                                  )
                                : token}
                            </span>
                            {localIdx < range.end - range.start - 1 ? " " : ""}
                          </span>
                        );
                      })}
                    </span>
                  );
                })
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
          </>
        )}

        </div>{/* /card */}
      </main>

      {/* Navigation — hidden on cover */}
      <nav className={`flex items-center justify-center gap-6 px-6 py-8 border-t border-border transition-opacity duration-200 ${(isCover || isEnd) ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
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
              onClick={() => { if (i !== currentPage) navigateToPage(i); }}
              aria-label={`Страница ${i + 1}`}
              className={`rounded-full transition-all ${
                i === currentPage
                  ? "w-2 h-2 bg-amber"
                  : "w-1.5 h-1.5 bg-border hover:bg-muted"
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
