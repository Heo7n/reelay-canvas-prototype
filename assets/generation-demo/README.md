# Generation demonstration footage

These three clips are local demonstration results for Reelay's simulated generation flow. They are stock footage, not output produced by Seedance or another AI model. They are not offered as a stock footage library or for standalone resale.

## Sources and license

Retrieved and checked on 2026-09-28. Each source page explicitly identifies its video as **Mixkit Stock Video Free License** and includes `https://mixkit.co/license/#videoFree` in its VideoObject metadata.

- License: https://mixkit.co/license/#videoFree
- License text endpoint: https://mixkit.co/license/modal/videoFree/
- Applicable terms: https://mixkit.co/terms/

The license permits commercial and non-commercial projects and says: “You're permitted to download, copy, modify, distribute, publicly perform and broadcast the Items.” Attribution is not required; Mixkit is credited here. The applicable terms prohibit standalone resale or stock/inventory redistribution and removal of watermarks or copyright notices. The original clips contain no visible watermark; none has been removed. Keep these files as embedded prototype demonstration media and keep this source notice with the build.

| Local clip | Original title | Source page | Downloaded source |
| --- | --- | --- | --- |
| `coast.mp4` / `coast.webp` | White sand beach background | https://mixkit.co/free-stock-video/white-sand-beach-background-1564/ | https://assets.mixkit.co/videos/1564/1564-720.mp4 |
| `mountains.mp4` / `mountains.webp` | Mountainous area in the Alps | https://mixkit.co/free-stock-video/mountainous-area-in-the-alps-4132/ | https://assets.mixkit.co/videos/4132/4132-720.mp4 |
| `forest.mp4` / `forest.webp` | The camera slowly slides into the tranquil forest on a sunny day | https://mixkit.co/free-stock-video/the-camera-slowly-slides-into-the-tranquil-forest-on-a-50847/ | https://assets.mixkit.co/videos/50847/50847-720.mp4 |

## Local processing and verification

Each local MP4 is an 8-second excerpt (source seconds 1–9), H.264 / yuv420p, 1280 × 720, 24 fps, with fast-start metadata and no audio track. Aspect ratio is preserved. Its accompanying 1280 × 720 WebP is an actual frame extracted 1 second into that local clip. No frame generation, watermark removal, or color manipulation was applied.

The files were decoded with FFmpeg, checked with FFprobe, and frames from the beginning, middle, and end were visually inspected. The three excerpts show white sand and turquoise sea, the Alps and moving clouds, and a sunny woodland, with no visible people or captions.

Processing recipe (FFmpeg 8.1.1):

```sh
ffmpeg -ss 1 -i source-720.mp4 -t 8 -an \
  -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1" \
  -c:v libx264 -preset medium -crf 28 -r 24 -pix_fmt yuv420p \
  -movflags +faststart clip.mp4
ffmpeg -ss 1 -i clip.mp4 -frames:v 1 -c:v libwebp -quality 85 clip.webp
```

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `coast.mp4` | 1035002 | `cb56ed7531c42c6db595ea45a55256e411fec797878984165dcfa0d9356e7307` |
| `coast.webp` | 61424 | `57b3830702fae3e59c29475ad0ece0c59e306652c5d6c04eb21e8a242e73e4b1` |
| `mountains.mp4` | 994678 | `49212f826ab5db6754df002fea0af8175214130e6a4bb83f6248cd695154c5a6` |
| `mountains.webp` | 77042 | `8a4af8d7ea457b240f1b68a0de5fc5ef5ce41a2da7a8c5369ed69472d456a138` |
| `forest.mp4` | 2326872 | `98e7d5724c0d0aee100b12f8ad0eee6cacfef5cf42cb494a48428a3ca33afab0` |
| `forest.webp` | 181190 | `e4930a2d1f01ea0ebbd66dd8594f92ff9d04026edf9b3f2196fbe1bd9dc5a263` |
