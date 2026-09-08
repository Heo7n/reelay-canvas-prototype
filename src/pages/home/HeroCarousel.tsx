import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { heroSlides } from "./home-content";
import styles from "./HeroCarousel.module.css";

interface HeroCarouselProps {
  paused?: boolean;
}

export function HeroCarousel({ paused = false }: HeroCarouselProps) {
  const activeCardRef = useRef<HTMLButtonElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [canAutoPlay, setCanAutoPlay] = useState(true);

  useEffect(() => {
    const reducedMotionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

    function syncAutoPlayPreference(): void {
      setCanAutoPlay(!document.hidden && !reducedMotionQuery?.matches);
    }

    syncAutoPlayPreference();
    document.addEventListener("visibilitychange", syncAutoPlayPreference);
    reducedMotionQuery?.addEventListener("change", syncAutoPlayPreference);
    return () => {
      document.removeEventListener("visibilitychange", syncAutoPlayPreference);
      reducedMotionQuery?.removeEventListener("change", syncAutoPlayPreference);
    };
  }, []);

  useEffect(() => {
    if (paused || !canAutoPlay || pointerPaused || focusPaused) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % heroSlides.length);
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, canAutoPlay, focusPaused, paused, pointerPaused]);

  function move(direction: -1 | 1): void {
    setActiveIndex((index) => (index + direction + heroSlides.length) % heroSlides.length);
  }

  return (
    <section
      className={styles.hero}
      aria-label="创作图景"
      aria-roledescription="carousel"
      onPointerEnter={(event) => { if (event.pointerType !== "touch") setPointerPaused(true); }}
      onPointerLeave={() => setPointerPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusPaused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <div className={styles.viewport}>
        <div className={styles.track}>
          {(["left", "active", "right"] as const).map((position, slotIndex) => {
            const index = (activeIndex + slotIndex - 1 + heroSlides.length) % heroSlides.length;
            const slide = heroSlides[index];
            return (
              <button
                className={`${styles.card} ${styles[position]}`}
                ref={position === "active" ? activeCardRef : undefined}
                key={position}
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                  activeCardRef.current?.focus({ preventScroll: true });
                }}
                aria-label={slide.title}
                aria-description={slide.description}
                aria-pressed={index === activeIndex}
              >
                {heroSlides.map((artwork, artworkIndex) => (
                  <span
                    key={artwork.id}
                    className={`${styles.artwork} ${artworkIndex === index ? styles.visibleArtwork : ""}`}
                    aria-hidden="true"
                  >
                    <img src={artwork.image} alt="" decoding="async" fetchPriority={position === "active" && artworkIndex === 0 ? "high" : "auto"} />
                    <span className={styles.shade} />
                    <span className={styles.caption}>
                      <strong className={styles.title}>{artwork.title}</strong>
                      <span className={styles.description}>{artwork.description}</span>
                    </span>
                  </span>
                ))}
              </button>
            );
          })}
        </div>
        <button className={`${styles.arrow} ${styles.arrowLeft}`} type="button" aria-label="上一张展示图" onClick={() => move(-1)}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <button className={`${styles.arrow} ${styles.arrowRight}`} type="button" aria-label="下一张展示图" onClick={() => move(1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className={styles.segments} aria-label="选择展示图">
        {heroSlides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            className={index === activeIndex ? styles.activeSegment : ""}
            aria-label={`显示${slide.title}`}
            aria-current={index === activeIndex ? "true" : undefined}
            onClick={() => setActiveIndex(index)}
          ><span aria-hidden="true" /></button>
        ))}
      </div>
    </section>
  );
}
