import heroSceneUrl from "../../../assets/home/hero-scene-v2.webp";
import heroCharacterUrl from "../../../assets/home/hero-character-v2.webp";
import heroMaterialUrl from "../../../assets/home/hero-material-v2.webp";

export interface HeroSlide {
  id: string;
  image: string;
  title: string;
  description: string;
}

export const heroSlides: HeroSlide[] = [
  { id: "scene", title: "场景构想", description: "空间 · 光线 · 氛围", image: heroSceneUrl },
  { id: "character", title: "人物塑造", description: "神态 · 造型 · 叙事", image: heroCharacterUrl },
  { id: "material", title: "视觉探索", description: "材质 · 色彩 · 构图", image: heroMaterialUrl },
];
