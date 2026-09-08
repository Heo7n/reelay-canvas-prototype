# 主页轮播图 v2

2026-09-08。使用内置 `image_gen` 工具逐张生成，未使用 CLI。网页中的标题和说明由 HTML 渲染，图片内不嵌字。

三图表达不同创作维度：远景的空间与光线、中景的人物与神态、近景的材质与构图。采用低饱和青绿阴影、暖白高光、少量琥珀色，作为创作方向展示，不代表真实客户项目或产品内实际生成案例。

| 标题 | 页面说明 | 项目资产 |
| --- | --- | --- |
| 场景构想 | 空间 · 光线 · 氛围 | [hero-scene-v2.webp](hero-scene-v2.webp) |
| 人物塑造 | 神态 · 造型 · 叙事 | [hero-character-v2.webp](hero-character-v2.webp) |
| 视觉探索 | 材质 · 色彩 · 构图 | [hero-material-v2.webp](hero-material-v2.webp) |

输出保留生成尺寸 1672 × 941，WebP quality 88，仅做格式压缩；页面卡片以 16:9 呈现。原始 PNG 保留在 Codex generated_images 中。

## 最终生成提示词

### 场景构想

```text
Use case: stylized-concept. Asset type: final landscape photograph-like hero image for Reelay, a refined B2B image and video creation workspace. Create one 16:9 wide image, ideally 2048x1152, with no text. Series art direction: tactile cinematic realism, muted mineral celadon and deep teal shadows, luminous warm ivory highlights, tiny touches of amber, restrained color, fine analog grain, spacious editorial composition, no black crushed shadows. Subject: a breathtaking architectural concept at the edge of a quiet tidal bay, a monumental gently sweeping limestone art pavilion nestled into weathered coastal cliffs, an elegantly curved cantilever roof and slender columns reflected in shallow still water. The structure should feel physically grounded, sophisticated and unexpected, not a sci-fi space station. A tiny solitary person on a stone causeway gives scale. Broad water and soft mountain silhouettes create atmospheric depth. Camera: wide establishing shot, human eye height, 35mm anamorphic cinema feeling. Composition: the memorable curved pavilion concentrated across the middle and upper two thirds, asymmetrical with clean horizon and calm lower quarter water, recognizable even at 400x225; critical forms stay within central 80% for responsive crops. Lighting: clear luminous morning light, soft warm sunlight grazing stone, cool teal ambient water, depth through light mist, textured natural materials. The lower 25% is quiet medium-dark teal reflection for readable HTML title overlay later. Avoid: typography, lettering, logo, border, collage, GUI, lens flare, neon cyberpunk, floating rings, magic portals, planets, spaceship, perfume, sneakers, product adverts, overly dark or brown grading. A beautiful cinematic frame with a clear focal point, not a generic AI fantasy wallpaper.
```

### 人物塑造

```text
Use case: photorealistic-natural. Asset type: final 16:9 wide hero photograph for Reelay creative workspace, ideally 2048x1152. Produce one image with absolutely no words or logos. Series art direction: cinematic realism, muted mineral celadon and deep teal shadows, luminous warm ivory highlights, subtle amber accents, fine analog grain, restrained editorial sophistication. Subject: an original fictional young East Asian woman, about 30, a coastal field researcher and traveler, shown from chest upwards in three-quarter view, standing in wind near a misty coastline. She looks off-frame with calm resolve, believable natural skin, a few windblown dark hair strands, an understated utilitarian dark petrol-teal jacket with tactile woven fabric and a small warm ochre scarf; avoid futuristic armor and glamour modeling. Behind her, softly blurred reeds, pale water, and a distant limestone structure lightly suggest her world. Composition: medium-close cinematic character study, face at x=55%, y=34%, head fully inside frame, shoulder silhouette across center; clean soft negative space on left, important features in the central 70%. The lower quarter is quiet dark coat and softly defocused shadows for HTML text overlay. Lighting: warm low side sunlight on cheek and hair, soft cool fill, dimensional but open shadows, 75mm cinema lens with convincing focus falloff, not glossy beauty retouching. Convey a specific person at the beginning of a story through gaze and costume details. Avoid: text, logo, watermarks, grids, character sheets, fantasy game promo, weapons, costumes with excessive straps, neon, space helmets, fashion advertising poses, airbrushed skin, exaggerated facial features, orange-and-teal oversaturation, black crushed background. This is a finished film-like character frame matching a luminous architectural landscape in the same photographic series.
```

### 视觉探索

```text
Use case: stylized-concept. Asset type: final landscape 16:9 fine-art material-study hero image for Reelay image/video creation workspace, ideally 2048x1152. Create one full-frame image, no text whatsoever. Shared series art direction: cinematic tactile realism, mineral celadon and deep petrol-teal shadows, luminous warm ivory highlights, minimal amber accent, subtle grain, restrained sophisticated color. Subject: an expressive sculptural study of light in a quiet artist's studio, a single large warm-ivory folded translucent paper ribbon arching diagonally through space, nestled alongside one matte celadon ceramic curved form and a small piece of thick amber cast glass. The overlapping surfaces catch a beam of soft sunlight so paper fibers, ceramic pores, glass refraction and the delicate colored shadow become the image's content. It must read as a tightly framed experimental image about materials, shape and light, not a product catalog or room decoration. No vases, no household products, no perfume or shoe. Composition: macro-like medium close-up, one decisive sweeping paper fold as focal point in central upper two-thirds, strong sculptural diagonal, gently blurred mineral-plaster studio background, negative space in the lower 25% with dark teal shadow for later HTML text overlay. Camera: physically plausible photographed practical set, 65mm lens, selective focus, clean yet organic craft detail. Lighting: luminous natural light from upper left, creamy highlights, long soft shadows and subtle amber caustic, enough brightness to sit harmoniously beside a coastal limestone scene and a cinematic human portrait. Avoid: letters, typography, logos, borders, collages, interface, desktop/screens, consumer products, abstract chrome donuts, floating spheres, plastic CGI gloss, neon gradients, rainbow spectrum, excessive objects, brown/black heavy treatment. Elegant and surprising, a real material experiment.
```

