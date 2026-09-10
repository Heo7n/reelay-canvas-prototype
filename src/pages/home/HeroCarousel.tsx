import { ChevronLeft, ChevronRight } from "lucide-react";
import { type CSSProperties, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";

import { heroSlides } from "./home-content";
import styles from "./HeroCarousel.module.css";

interface HeroCarouselProps {
  paused?: boolean;
}

const SLIDE_COUNT = heroSlides.length;
const TRANSITION_MS = 500;
// Keep neighbouring copies mounted so the loop can reset outside the viewport.
const trackSlides = [...heroSlides, ...heroSlides, ...heroSlides];

interface TrackState {
  center: number;
  requestedIndex: number;
  phase: "idle" | "moving" | "rebasing";
}

type TrackAction =
  | { type: "select"; index: number; instant: boolean }
  | { type: "step"; direction: -1 | 1; instant: boolean }
  | { type: "finished" }
  | { type: "rebased" }
  | { type: "settle" };

function slideIndex(position: number): number {
  return ((position % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT;
}

function startRequestedMove(state: TrackState): TrackState {
  const distance = slideIndex(state.requestedIndex - slideIndex(state.center));
  if (distance === 0) return { ...state, phase: "idle" };
  const direction = distance <= SLIDE_COUNT / 2 ? 1 : -1;
  return { ...state, center: state.center + direction, phase: "moving" };
}

function reduceTrack(state: TrackState, action: TrackAction): TrackState {
  if (action.type === "settle") {
    return { ...state, center: SLIDE_COUNT + state.requestedIndex, phase: "idle" };
  }
  if (action.type === "finished") {
    const normalizedCenter = SLIDE_COUNT + slideIndex(state.center);
    return normalizedCenter === state.center
      ? startRequestedMove(state)
      : { ...state, center: normalizedCenter, phase: "rebasing" };
  }
  if (action.type === "rebased") return startRequestedMove(state);

  const requestedIndex = action.type === "step"
    ? slideIndex(state.requestedIndex + action.direction)
    : action.index;
  const next = { ...state, requestedIndex };
  if (action.instant) return { ...next, center: SLIDE_COUNT + requestedIndex, phase: "idle" };
  // Finish the current physical step, then honour the latest requested image.
  return state.phase === "idle" ? startRequestedMove(next) : next;
}

export function HeroCarousel({ paused = false }: HeroCarouselProps) {
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [track, dispatch] = useReducer(reduceTrack, { center: SLIDE_COUNT, requestedIndex: 0, phase: "idle" });
  const activeIndex = slideIndex(track.center);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const reducedMotionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

    function syncAutoPlayPreference(): void {
      setPageVisible(!document.hidden);
      setReducedMotion(Boolean(reducedMotionQuery?.matches));
      if (reducedMotionQuery?.matches) dispatch({ type: "settle" });
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
    if (track.phase === "moving") {
      const timer = window.setTimeout(() => dispatch({ type: "finished" }), TRANSITION_MS);
      return () => window.clearTimeout(timer);
    }
    if (track.phase === "rebasing") {
      // Commit the equivalent resting positions before enabling another transition.
      let nextFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        nextFrame = window.requestAnimationFrame(() => dispatch({ type: "rebased" }));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(nextFrame);
      };
    }
    return undefined;
  }, [track.center, track.phase]);

  useLayoutEffect(() => {
    const focusedPosition = cardRefs.current.findIndex((card) => card !== null && card === document.activeElement);
    if (focusedPosition < 0 || Math.abs(focusedPosition - track.center) <= 1) return;
    const distance = slideIndex(focusedPosition - track.center);
    const nearestOffset = distance <= SLIDE_COUNT / 2 ? distance : distance - SLIDE_COUNT;
    cardRefs.current[track.center + nearestOffset]?.focus({ preventScroll: true });
  }, [track.center]);

  useEffect(() => {
    if (paused || !pageVisible || reducedMotion || pointerPaused || focusPaused) return undefined;
    const timer = window.setTimeout(() => {
      dispatch({ type: "step", direction: 1, instant: false });
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, pageVisible, reducedMotion, focusPaused, paused, pointerPaused]);

  function move(direction: -1 | 1): void {
    dispatch({ type: "step", direction, instant: reducedMotion });
  }

  function select(index: number): void {
    dispatch({ type: "select", index, instant: reducedMotion });
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
        <div
          className={styles.track}
          data-moving={track.phase === "moving" || undefined}
          style={{ "--carousel-duration": `${TRANSITION_MS}ms` } as CSSProperties}
        >
          {trackSlides.map((slide, position) => {
            const offset = position - track.center;
            const isVisible = Math.abs(offset) <= 1;
            const isActive = offset === 0;
            return (
              <button
                className={`${styles.card} ${isActive ? styles.active : ""}`}
                style={{ "--card-offset": offset } as CSSProperties}
                ref={(card) => { cardRefs.current[position] = card; }}
                key={`${slide.id}-${Math.floor(position / SLIDE_COUNT)}`}
                type="button"
                tabIndex={isVisible ? 0 : -1}
                aria-hidden={!isVisible || undefined}
                onClick={(event) => {
                  event.currentTarget.focus({ preventScroll: true });
                  select(slideIndex(position));
                }}
                aria-label={slide.title}
                aria-description={slide.description}
                aria-pressed={isActive}
              >
                <img src={slide.image} alt="" decoding="async" fetchPriority={position === SLIDE_COUNT ? "high" : "auto"} />
                <span className={styles.shade} aria-hidden="true" />
                <span className={styles.caption} aria-hidden="true">
                  <strong className={styles.title}>{slide.title}</strong>
                  <span className={styles.description}>{slide.description}</span>
                </span>
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
            onClick={() => select(index)}
          ><span aria-hidden="true" /></button>
        ))}
      </div>
    </section>
  );
}
