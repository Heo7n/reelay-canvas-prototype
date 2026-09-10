import characterCoverUrl from "../../../assets/home/project-character.webp";
import brandStoryCoverUrl from "../../../assets/home/project-brand-story.webp";
import conceptCoverUrl from "../../../assets/home/project-concept.webp";
import defaultCoverUrl from "../../../assets/home/project-default.webp";
import educationCoverUrl from "../../../assets/home/project-education.webp";
import perfumeCoverUrl from "../../../assets/home/project-perfume.webp";
import productCoverUrl from "../../../assets/home/project-product.webp";
import scifiCoverUrl from "../../../assets/home/project-scifi.webp";

const projectCoverUrls: Record<string, string> = {
  "demo-cover-brand-story": brandStoryCoverUrl,
  "demo-cover-character": characterCoverUrl,
  "demo-cover-concept": conceptCoverUrl,
  "demo-cover-education": educationCoverUrl,
  "demo-cover-perfume": perfumeCoverUrl,
  "demo-cover-product": productCoverUrl,
  "demo-cover-scifi": scifiCoverUrl,
};

export function resolveProjectCoverUrl(coverAssetId: string | null): string {
  return coverAssetId && Object.hasOwn(projectCoverUrls, coverAssetId) ? projectCoverUrls[coverAssetId] : defaultCoverUrl;
}
