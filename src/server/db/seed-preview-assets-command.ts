import { previewAssetSeedErrorMessage, seedPreviewAssets } from "./seed-preview-assets";

void seedPreviewAssets().then((seeded) => {
  console.log(`Preview personal catalog is present (${seeded.assets.length} media assets, ${seeded.entities.length} Entities).`);
}).catch((error: unknown) => {
  console.error(previewAssetSeedErrorMessage(error));
  process.exitCode = 1;
});
