import type { LucideIcon } from "lucide-react";
import {
  FolderKanban,
  Grid2X2,
  ImagePlay,
  PanelsTopLeft,
  Sparkles,
  SquareM,
  UserRoundCheck,
  Workflow,
} from "lucide-react";

import heroAssetsUrl from "../../../assets/home/hero-assets.webp";
import heroStoryboardUrl from "../../../assets/home/hero-storyboard.webp";
import heroVideoUrl from "../../../assets/home/hero-video-workflow.webp";

export interface HeroSlide {
  description: string;
  id: string;
  image: string;
  title: string;
}

export interface Capability {
  icon: LucideIcon;
  id: string;
  label: string;
  prompt: string;
}

export const heroSlides: HeroSlide[] = [
  {
    id: "storyboard",
    title: "AI 分镜与脚本协作",
    description: "从创作意图到可执行镜头，组织脚本、分镜与参考素材",
    image: heroStoryboardUrl,
  },
  {
    id: "video-workflow",
    title: "视频创作工作流",
    description: "AI 驱动的全流程创作，加速高质量视频内容生产",
    image: heroVideoUrl,
  },
  {
    id: "project-assets",
    title: "项目素材统一组织",
    description: "让角色、场景与镜头素材在创作过程中保持清晰关系",
    image: heroAssetsUrl,
  },
];

export const capabilities: Capability[] = [
  { id: "storyboard", label: "AI 分镜", icon: PanelsTopLeft, prompt: "帮我把创作想法拆成一组可执行的 AI 分镜" },
  { id: "text-video", label: "文生视频", icon: SquareM, prompt: "根据文字创意创建一个视频生成项目" },
  { id: "image-video", label: "图生视频", icon: ImagePlay, prompt: "根据参考图片设计一段自然连贯的视频" },
  { id: "character", label: "角色一致性", icon: UserRoundCheck, prompt: "创建一个保持角色形象一致的视频项目" },
  { id: "canvas", label: "画布编排", icon: Workflow, prompt: "在画布中组织素材、生成节点与镜头关系" },
  { id: "assets", label: "项目资产", icon: FolderKanban, prompt: "整理当前项目中的角色、场景与素材资产" },
  { id: "agent", label: "Reelay Agent", icon: Sparkles, prompt: "让 Reelay Agent 帮我规划这个创作项目" },
  { id: "all", label: "全部能力", icon: Grid2X2, prompt: "" },
];
