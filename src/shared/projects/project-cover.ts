import characterCoverUrl from "../../../assets/home/project-character.webp";
import educationCoverUrl from "../../../assets/home/project-education.webp";
import perfumeCoverUrl from "../../../assets/home/project-perfume.webp";
import productCoverUrl from "../../../assets/home/project-product.webp";
import scifiCoverUrl from "../../../assets/home/project-scifi.webp";

const projectCoverUrls: Record<string, string> = {
  "demo-cover-character": characterCoverUrl,
  "demo-cover-education": educationCoverUrl,
  "demo-cover-perfume": perfumeCoverUrl,
  "demo-cover-product": productCoverUrl,
  "demo-cover-scifi": scifiCoverUrl,
};

export function resolveProjectCoverUrl(coverAssetId: string | null): string | null {
  return coverAssetId ? projectCoverUrls[coverAssetId] ?? null : null;
}
