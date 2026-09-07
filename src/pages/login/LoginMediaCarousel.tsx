import { useEffect, useState } from "react";

import brandImage from "../../../assets/login/brand-light.webp";
import storyImage from "../../../assets/login/coastal-story.webp";
import worldImage from "../../../assets/login/observatory-world.webp";
import styles from "./LoginMediaCarousel.module.css";

const slides = [
  {
    image: brandImage,
    position: "50% center",
    alt: "象牙白薄片在深色空间舒展，柔和光线从折面之间透出",
    category: "灵感展开",
    title: "让灵感，展开新的可能。",
    description: "从一瞬灵感出发，探索画面里的更多可能。",
  },
  {
    image: storyImage,
    position: "50% center",
    alt: "海岸晨光中，穿橄榄色外套的短发女性望向远处",
    category: "角色叙事",
    title: "让角色，走进你的故事。",
    description: "从人物设定出发，延展故事里的每一幕。",
  },
  {
    image: worldImage,
    position: "50% center",
    alt: "嵌入海岸岩壁的圆环建筑，框住远处的海面与晨雾",
    category: "想象世界",
    title: "为想象，打开新的场景。",
    description: "让光影、空间与细节，共同构建一个世界。",
  },
] as const;

export function LoginMediaCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
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

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setActiveIndex((index) => (index + 1) % slides.length), 4_500);
    return () => window.clearTimeout(timer);
  }, [activeIndex, playing]);

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
            className={`${styles.slide} ${index === activeIndex ? styles.active : ""}`}
            aria-hidden={index !== activeIndex}
            role="group"
            aria-roledescription="展示图"
            aria-label={`${index + 1} / ${slides.length}`}
          >
            <img src={slide.image} alt={slide.alt} style={{ objectPosition: slide.position }} />
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
              onClick={() => setActiveIndex(index)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
      </div>
    </section>
  );
}
