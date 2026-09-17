# Inspiration preview excerpts

These excerpts are derived from the already published fixtures declared in
`src/config/media-demo-fixtures.ts`. They are creative demo shorts, not footage
from a connected film-search service. No account files or database records were
used. Source labels in the catalog identify the existing source fixture series;
they do not assert a film title, copyright owner, or an additional usage license.

| Output | Existing source | Source interval |
| --- | --- | --- |
| coast.webm | multishot-fe80f293.webm | 0–10 s |
| moon.webm | seedance-empty-state-7ed500ba.webm | 7–15 s |
| road.webm | editing-empty-state-dfddf1e7.webm | 0–6.8 s |
| stairs.webm | seedance-empty-state-7ed500ba.webm | 22–25 s |

Videos use VP9 at 960 px width, maintaining aspect ratio. The coast excerpt
retains its source audio; the other source videos have no audio track. WebP
posters are actual frames from each excerpt. Descriptions and observations are
curated text based on these frames, not output from an AI analysis service.

`src/config/inspiration-catalog.js` owns the preview catalog. The legacy build
copies only the catalog's declared media and poster paths into both builds.
