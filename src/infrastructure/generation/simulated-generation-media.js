(function registerSimulatedGenerationMedia(root) {
  "use strict";

  function createSelector({ image, videos, random = Math.random }) {
    let previousVideoUrl = null;
    return function select(mediaType, sourceDraftAsset = null) {
      // A final render is the same shot, and must not consume another demo choice.
      if (sourceDraftAsset) return { ...sourceDraftAsset };
      if (mediaType !== "video") return { ...image };
      const candidates = videos.filter((asset) => asset.url !== previousVideoUrl);
      const pool = candidates.length ? candidates : videos;
      const asset = pool[Math.floor(random() * pool.length)];
      previousVideoUrl = asset.url;
      return { ...asset };
    };
  }

  root.REELAY_SIMULATED_GENERATION_MEDIA = Object.freeze({ createSelector });
})(globalThis);
