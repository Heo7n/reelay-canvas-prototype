import { useEffect, useState } from "react";

import { firstLoginImagePlaceholder, loginSlides as slides } from "./login-media";
import styles from "./LoginMediaCarousel.module.css";

export function LoginMediaCarousel() {
  const [{ activeIndex, previousIndex }, setPresentation] = useState({ activeIndex: 0, previousIndex: -1 });
  const [mediaStatus, setMediaStatus] = useState<Array<"loading" | "ready" | "failed">>(() => slides.map(() => "loading"));
  const [request, setRequest] = useState<{ index: number; automatic: boolean } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [environmentAllowsPlayback, setEnvironmentAllowsPlayback] = useState(false);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const narrowQuery = window.matchMedia?.("(max-width: 720px)");

    function updateEnvironment() {
      setEnvironmentAllowsPlayback(!document.hidden && !reducedMotionQuery?.matches && !narrowQuery?.matches);
    }

    updateEnvironment();
    document.addEventListener("visibilitychange", updateEnvironment);
    reducedMotionQuery?.addEventListener("change", updateEnvironment);
    narrowQuery?.addEventListener("change", updateEnvironment);
    return () => {
      document.removeEventListener("visibilitychange", updateEnvironment);
      reducedMotionQuery?.removeEventListener("change", updateEnvironment);
      narrowQuery?.removeEventListener("change", updateEnvironment);
    };
  }, []);

  const playing = environmentAllowsPlayback && !focused && !hovered;
  const nextIndex = slides.map((_, offset) => (activeIndex + offset + 1) % slides.length)
    .find((index) => index !== activeIndex && mediaStatus[index] !== "failed");
  const activeLoaded = mediaStatus[activeIndex] !== "loading";

  useEffect(() => {
    if (!playing || !activeLoaded || request || nextIndex === undefined) return;
    const timer = window.setTimeout(() => setRequest({ index: nextIndex, automatic: true }), 4_500);
    return () => window.clearTimeout(timer);
  }, [activeIndex, activeLoaded, nextIndex, playing, request]);

  useEffect(() => {
    if (!request) return;
    if ((request.automatic && !playing) || mediaStatus[request.index] === "failed") {
      setRequest(null);
    } else if (mediaStatus[request.index] === "ready") {
      setPresentation((current) => current.activeIndex === request.index ? current : {
        activeIndex: request.index, previousIndex: current.activeIndex,
      });
      setRequest(null);
    }
  }, [mediaStatus, playing, request]);

  function updateMediaStatus(index: number, status: "ready" | "failed"): void {
    setMediaStatus((current) => current.map((value, position) => position === index ? status : value));
  }

  async function revealDecodedImage(image: HTMLImageElement, index: number): Promise<void> {
    try {
      await image.decode?.();
      if (image.isConnected) updateMediaStatus(index, "ready");
    } catch {
      if (image.isConnected) updateMediaStatus(index, "failed");
    }
  }

  return (
    <section
      className={styles.carousel}
      aria-label="Reelay 创作展示"
      aria-roledescription="轮播"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className={styles.slides} aria-live={playing ? "off" : "polite"} aria-atomic="true">
        {slides.map((slide, index) => (
          <div
            key={slide.category}
            className={`${styles.slide} ${index === activeIndex ? styles.active : ""} ${index === previousIndex ? styles.previous : ""}`}
            aria-hidden={index !== activeIndex}
            role="group"
            aria-roledescription="展示图"
            aria-label={`${index + 1} / ${slides.length}`}
          >
            {index === 0 ? <div className={styles.placeholder} aria-hidden="true"
              style={{ backgroundImage: `url("${firstLoginImagePlaceholder}")`, backgroundPosition: slide.position }} /> : null}
            <img src={slide.image} alt={slide.alt} style={{ objectPosition: slide.position }}
              className={mediaStatus[index] === "ready" ? styles.imageReady : undefined}
              fetchPriority={index === 0 ? "high" : "low"} decoding="async"
              onLoad={(event) => { void revealDecodedImage(event.currentTarget, index); }}
              onError={() => updateMediaStatus(index, "failed")} />
            <div className={styles.shade} aria-hidden="true" />
            <div className={styles.copy}>
              <p className={styles.category}>{slide.category}</p>
              <h2>{slide.title}</h2>
              <p className={styles.description}>{slide.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.controls} aria-label="选择展示图">
          {slides.map((slide, index) => (
            <button
              key={slide.category}
              className={styles.segment}
              type="button"
              aria-label={`显示${slide.category}`}
              aria-current={activeIndex === index ? "true" : undefined}
              onClick={() => setRequest({ index, automatic: false })}
            >
              <span aria-hidden="true" />
            </button>
          ))}
      </div>
    </section>
  );
}
