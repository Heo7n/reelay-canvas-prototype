import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import type { HeroSlide } from "./home-content";
import styles from "./WorkspacePages.module.css";

interface HeroCarouselProps {
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onChooseSlide: (slide: HeroSlide) => void;
  slides: HeroSlide[];
}

export function HeroCarousel({ activeIndex, onActiveIndexChange, onChooseSlide, slides }: HeroCarouselProps) {
  const [isInteractionPaused, setIsInteractionPaused] = useState(false);
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
    if (!canAutoPlay || isInteractionPaused || slides.length < 2) return undefined;

    const timer = window.setTimeout(() => {
      onActiveIndexChange((activeIndex + 1) % slides.length);
    }, 4_000);

    return () => window.clearTimeout(timer);
  }, [activeIndex, canAutoPlay, isInteractionPaused, onActiveIndexChange, slides.length]);

  function move(direction: -1 | 1): void {
    onActiveIndexChange((activeIndex + direction + slides.length) % slides.length);
  }

  return (
    <section
      className={styles.hero}
      aria-label="Reelay 创作能力"
      aria-roledescription="carousel"
      onPointerEnter={() => setIsInteractionPaused(true)}
      onPointerLeave={() => setIsInteractionPaused(false)}
      onFocusCapture={() => setIsInteractionPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsInteractionPaused(false);
      }}
    >
      <button className={`${styles.heroArrow} ${styles.heroArrowLeft}`} type="button" aria-label="上一项" onClick={() => move(-1)}>
        <ChevronLeft aria-hidden="true" />
      </button>

      <div className={styles.heroTrack}>
        {slides.map((slide, index) => {
          const relative = (index - activeIndex + slides.length) % slides.length;
          const position = relative === 0 ? "active" : relative === 1 ? "right" : "left";
          return (
            <button
              className={`${styles.heroCard} ${styles[`heroCard_${position}`]}`}
              key={slide.id}
              type="button"
              onClick={() => position === "active" ? onChooseSlide(slide) : onActiveIndexChange(index)}
              aria-label={`${slide.title}${position === "active" ? "，使用此创作方向" : ""}`}
            >
              <img src={slide.image} alt="" />
              <span className={styles.heroShade} aria-hidden="true" />
              <span className={styles.heroCopy}>
                <strong>{slide.title}</strong>
                <small>{slide.description}</small>
              </span>
            </button>
          );
        })}
      </div>

      <button className={`${styles.heroArrow} ${styles.heroArrowRight}`} type="button" aria-label="下一项" onClick={() => move(1)}>
        <ChevronRight aria-hidden="true" />
      </button>

      <div className={styles.heroDots} aria-label="选择轮播内容">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            className={index === activeIndex ? styles.activeDot : ""}
            aria-label={`显示${slide.title}`}
            aria-current={index === activeIndex ? "true" : undefined}
            onClick={() => onActiveIndexChange(index)}
          />
        ))}
      </div>
    </section>
  );
}
