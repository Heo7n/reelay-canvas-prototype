import { preload } from "react-dom";

import brandImage from "../../../assets/login/brand-light.webp";
import storyImage from "../../../assets/login/coastal-story.webp";
import worldImage from "../../../assets/login/observatory-world.webp";

// Same first image, resized to 40 × 48 WebP (quality 35); 256 bytes, no request.
export const firstLoginImagePlaceholder = "data:image/webp;base64,UklGRvgAAABXRUJQVlA4IOwAAABwCQCdASooADAAPvlqqU6qpiOiLjv+YVAfCWcAyYg2od5mR1onlgiLA07JGc0SksZ491p34O6ZVsrmBSFWaThQ85gPHDxOLYBEPLUulPSXJyaS2oAA/vQpPbvZlF6YxTuJDP5T6FpsYv1PyKsbPuxHFW29E/7jNQyxP1MsctQGtWJbJ6EVfborqm+VD+cfEFjIfx9kB5pgYM5Eu4KgHclrZcBKNe2Lwo3XChujQQ9zHwK/G3qdfcHUegFuqFlt03k+pJ8wyNeqNxVehsUYHc8Vt1PfG2DVZk0vukX9i55Dy+gMvlV/fnff3VAAAA==";

export const loginSlides = [
  {
    image: worldImage,
    position: "50% center",
    alt: "嵌入海岸岩壁的圆环建筑，框住远处的海面与晨雾",
    category: "想象世界",
    title: "为想象，打开新的场景。",
    description: "让光影、空间与细节，共同构建一个世界。",
  },
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
] as const;

export function preloadFirstLoginImage(): void {
  if (document.hidden || window.matchMedia?.("(max-width: 720px)").matches) return;
  preload(loginSlides[0].image, { as: "image", fetchPriority: "low" });
}
