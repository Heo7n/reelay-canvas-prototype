import { useEffect, useState } from "react";

import styles from "./PromptExamples.module.css";

const examples = [
  "生成一张产品主视觉，柔和侧光，留出文案空间",
  "设计一位角色的半身肖像，统一服装与色彩",
  "描绘一段镜头：薄雾穿过山谷，镜头缓缓推进",
];
const staticHint = "描述主体、场景、风格与光线…";

type Phase = "typing" | "holding" | "erasing" | "waiting";
interface TypingState {
  example: number;
  characters: number;
  phase: Phase;
}

const phaseDelay: Record<Phase, number> = {
  typing: 65,
  holding: 1_800,
  erasing: 30,
  waiting: 450,
};

function advance(state: TypingState): TypingState {
  switch (state.phase) {
    case "typing": {
      const characters = state.characters + 1;
      return { ...state, characters, phase: characters === examples[state.example].length ? "holding" : "typing" };
    }
    case "holding":
      return { ...state, characters: state.characters - 1, phase: "erasing" };
    case "erasing": {
      const characters = state.characters - 1;
      return { ...state, characters, phase: characters === 0 ? "waiting" : "erasing" };
    }
    case "waiting":
      return { example: (state.example + 1) % examples.length, characters: 0, phase: "typing" };
  }
}

export function PromptExamples({ active }: { active: boolean }) {
  const [typing, setTyping] = useState<TypingState>({ example: 0, characters: 0, phase: "typing" });
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const preference = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    function syncVisibility() { setVisible(!document.hidden); }
    function syncMotion() { setReducedMotion(preference?.matches ?? false); }

    syncVisibility();
    syncMotion();
    document.addEventListener("visibilitychange", syncVisibility);
    preference?.addEventListener("change", syncMotion);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      preference?.removeEventListener("change", syncMotion);
    };
  }, []);

  const running = active && visible && !reducedMotion;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setTyping(advance), phaseDelay[typing.phase]);
    return () => window.clearTimeout(timer);
  }, [running, typing]);

  return (
    <span className={styles.example} aria-hidden="true">
      <span>{reducedMotion ? staticHint : examples[typing.example].slice(0, typing.characters)}</span>
      {!reducedMotion && <span className={`${styles.cursor} ${running ? styles.running : ""}`} />}
    </span>
  );
}
