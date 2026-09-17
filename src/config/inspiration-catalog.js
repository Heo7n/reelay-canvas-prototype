(function defineInspirationCatalog(root) {
  "use strict";

  // Verified continuous excerpts; source attribution ships with both builds.
  // Cut boundaries are relative to each local excerpt, never generated splits.
  const analysisVersion = "curated-v2";
  const clips = [
    {
      hasAudio: true,
      id: "inspiration-coast",
      title: "海岸 · 跳水与归来",
      file: "coast",
      duration: 10.008,
      sourceLabel: "MultiShot",
      width: 960,
      height: 540,
      description: "从海边举瓶、掠水与落水，转入动画男孩的水下游动、攀船与举桶。片段以叠化和切镜串联不同画风。",
      tags: ["动作衔接", "自然光", "多镜头"],
      observations: [{"label": "动作", "text": "水花衔接水下游动，随后切到攀船与举桶；真人感画面与动画角色并非同一主体。"}, {"label": "色彩", "text": "水面的蓝绿色与人物肤色形成对照，明亮日光贯穿镜头。"}],
      shots: [
        {"id": "inspiration-coast-shot-1", "start": 0, "end": 1.833, "title": "海边举瓶", "summary": "男子在海边举起透明瓶，山与海岸位于背景。", "framing": "近景", "movement": "机位基本稳定", "composition": "人物居左，瓶子伸向画面右侧", "light": "暖色日光，面部与海面明亮", "transition": "片段起始", "posterUrl": "./assets/inspiration/coast-shot-1.webp", "prompt": "男子在海边举起透明瓶，山与海岸位于背景。近景，机位基本稳定。人物居左，瓶子伸向画面右侧。暖色日光，面部与海面明亮。"},
        {"id": "inspiration-coast-shot-2", "start": 1.833, "end": 3.208, "title": "掠过水面", "summary": "人物骑在瓶状物体上掠过水面，身后带出白色水花。", "framing": "全景", "movement": "侧向跟随", "composition": "人物与水花横向展开，远山交代环境", "light": "明亮日光与蓝绿色水面", "transition": "叠化转入，边界取叠化中点", "posterUrl": "./assets/inspiration/coast-shot-2.webp", "prompt": "人物骑在瓶状物体上掠过水面，身后带出白色水花。全景，侧向跟随。人物与水花横向展开，远山交代环境。明亮日光与蓝绿色水面。"},
        {"id": "inspiration-coast-shot-3", "start": 3.208, "end": 5.708, "title": "向前冲出并落水", "summary": "正面人物靠近，失去平衡后落入水中，水花逐渐遮住主体。", "framing": "全景向中景变化", "movement": "正面观察主体接近", "composition": "人物在中部，水面占据画面下方", "light": "明亮日光，水花形成高亮区域", "transition": "硬切换到正面", "posterUrl": "./assets/inspiration/coast-shot-3.webp", "prompt": "正面人物靠近，失去平衡后落入水中，水花逐渐遮住主体。全景向中景变化，正面观察主体接近。人物在中部，水面占据画面下方。明亮日光，水花形成高亮区域。"},
        {"id": "inspiration-coast-shot-4", "start": 5.708, "end": 7.167, "title": "水下游动", "summary": "画面转为动画男孩在水下向前游动，伸手靠近画面右侧。", "framing": "中近景", "movement": "贴近人物横向跟随", "composition": "人物横贯画面，水面位于上方", "light": "蓝绿色水下环境，水面波光可见", "transition": "由水花叠化到水下，边界取叠化中点", "posterUrl": "./assets/inspiration/coast-shot-4.webp", "prompt": "画面转为动画男孩在水下向前游动，伸手靠近画面右侧。中近景，贴近人物横向跟随。人物横贯画面，水面位于上方。蓝绿色水下环境，水面波光可见。"},
        {"id": "inspiration-coast-shot-5", "start": 7.167, "end": 8.75, "title": "攀上小船", "summary": "男孩双手抓住船沿向上攀爬，船内可见装鱼的桶和绳索。", "framing": "近景", "movement": "贴近船沿观察", "composition": "船沿斜向分割画面，鱼桶位于右侧", "light": "水面与船沿有明亮反光", "transition": "切换到船边视角", "posterUrl": "./assets/inspiration/coast-shot-5.webp", "prompt": "男孩双手抓住船沿向上攀爬，船内可见装鱼的桶和绳索。近景，贴近船沿观察。船沿斜向分割画面，鱼桶位于右侧。水面与船沿有明亮反光。"},
        {"id": "inspiration-coast-shot-6", "start": 8.75, "end": 10.008, "title": "举起鱼桶", "summary": "男孩站在岸边举起鱼桶，码头、海鸟和山景形成背景。", "framing": "全景", "movement": "机位基本稳定", "composition": "人物居中，码头横向延伸", "light": "明亮海岸日光", "transition": "硬切到岸边全景", "posterUrl": "./assets/inspiration/coast-shot-6.webp", "prompt": "男孩站在岸边举起鱼桶，码头、海鸟和山景形成背景。全景，机位基本稳定。人物居中，码头横向延伸。明亮海岸日光。"},
      ],
      url: "./assets/inspiration/coast.webm",
      posterUrl: "./assets/inspiration/coast.webp",
      analysisVersion: "curated-v2",
    },
    {
      hasAudio: false,
      id: "inspiration-moon",
      title: "月面 · 人物与远行",
      file: "moon",
      duration: 7.633,
      sourceLabel: "Seedance",
      width: 960,
      height: 540,
      description: "月面身影、头盔特写、宇航员上车与探测车疾驰，通过景别变化、明暗和扬尘建立空间尺度。",
      tags: ["空间尺度", "逆光", "运动"],
      observations: [{"label": "构图", "text": "以小体量人物和载具对照开阔月面，先建立环境，再关注运动主体。"}, {"label": "光线", "text": "深色背景与明亮地表分离轮廓，尘土使载具运动更容易感知。"}],
      shots: [
        {"id": "inspiration-moon-shot-1", "start": 0, "end": 1.467, "title": "月面身影", "summary": "瘦长的人形身影站在月面上，明亮地表与深色天空形成反差。", "framing": "全景", "movement": "机位基本稳定", "composition": "人物偏左，地平线横贯画面", "light": "侧后方强光勾出轮廓", "transition": "片段起始", "posterUrl": "./assets/inspiration/moon-shot-1.webp", "prompt": "瘦长的人形身影站在月面上，明亮地表与深色天空形成反差。全景，机位基本稳定。人物偏左，地平线横贯画面。侧后方强光勾出轮廓。"},
        {"id": "inspiration-moon-shot-2", "start": 1.467, "end": 3, "title": "头盔面罩", "summary": "宇航员头盔占据画面主体，面罩反射出周围月面与身影。", "framing": "特写", "movement": "缓慢靠近面罩", "composition": "头盔居中，反射成为视觉重点", "light": "金色面罩反光与暗背景对照", "transition": "硬切至头盔特写", "posterUrl": "./assets/inspiration/moon-shot-2.webp", "prompt": "宇航员头盔占据画面主体，面罩反射出周围月面与身影。特写，缓慢靠近面罩。头盔居中，反射成为视觉重点。金色面罩反光与暗背景对照。"},
        {"id": "inspiration-moon-shot-3", "start": 3, "end": 5.4, "title": "进入探测车", "summary": "宇航员跨入探测车并坐下，车体和仪器近距离包围人物。", "framing": "中景", "movement": "近距离随动作移动", "composition": "人物居中，车架与仪器构成前景", "light": "强烈明暗分区，服装亮部清晰", "transition": "切换至车旁视角", "posterUrl": "./assets/inspiration/moon-shot-3.webp", "prompt": "宇航员跨入探测车并坐下，车体和仪器近距离包围人物。中景，近距离随动作移动。人物居中，车架与仪器构成前景。强烈明暗分区，服装亮部清晰。"},
        {"id": "inspiration-moon-shot-4", "start": 5.4, "end": 7.633, "title": "探测车疾驰", "summary": "探测车在月面驶过，扬起长条尘土，车体转向后继续前行。", "framing": "全景", "movement": "横向跟随车辆", "composition": "车辆横向运动，尘土留在后方", "light": "亮地表与黑色天空形成反差", "transition": "硬切至车辆全景", "posterUrl": "./assets/inspiration/moon-shot-4.webp", "prompt": "探测车在月面驶过，扬起长条尘土，车体转向后继续前行。全景，横向跟随车辆。车辆横向运动，尘土留在后方。亮地表与黑色天空形成反差。"},
      ],
      url: "./assets/inspiration/moon.webm",
      posterUrl: "./assets/inspiration/moon.webp",
      analysisVersion: "curated-v2",
    },
    {
      hasAudio: false,
      id: "inspiration-road",
      title: "公路 · 疾驰与街头",
      file: "road",
      duration: 6.8,
      sourceLabel: "Edit Studio",
      width: 960,
      height: 536,
      description: "贴近车身的连续运动视角中，车窗外形象不断变化；随后切到城市街头人物，形成速度与姿态的对比。",
      tags: ["跟拍", "速度感", "人物"],
      observations: [{"label": "运镜", "text": "贴近车身观察运动，让背景位移传递速度，主体保持明确的视觉重心。"}, {"label": "节奏", "text": "快速运动与更稳定的人物画面形成对比，可用于设计情绪转折。"}],
      shots: [
        {"id": "inspiration-road-shot-1", "start": 0, "end": 5.033, "title": "车窗形象连续变化", "summary": "贴近橙色车身的视角保持一致，车窗外形象连续变为人物、动物、气球等。", "framing": "中近景", "movement": "随车前行，背景快速后移", "composition": "车身位于左侧，道路向右上方延伸", "light": "树荫与日光交替掠过", "transition": "连续机位中的形象替换，不硬拆成多个机位", "posterUrl": "./assets/inspiration/road-shot-1.webp", "prompt": "贴近橙色车身的视角保持一致，车窗外形象连续变为人物、动物、气球等。中近景，随车前行，背景快速后移。车身位于左侧，道路向右上方延伸。树荫与日光交替掠过。"},
        {"id": "inspiration-road-shot-2", "start": 5.033, "end": 6.8, "title": "街头人物", "summary": "人物从街道走向车头并坐上引擎盖，车辆与街道建筑围绕主体。", "framing": "全景向中景变化", "movement": "面对人物与车辆缓慢靠近", "composition": "人物和车头在中央，街道向背景延伸", "light": "城市日光，建筑形成局部阴影", "transition": "硬切到城市街头", "posterUrl": "./assets/inspiration/road-shot-2.webp", "prompt": "人物从街道走向车头并坐上引擎盖，车辆与街道建筑围绕主体。全景向中景变化，面对人物与车辆缓慢靠近。人物和车头在中央，街道向背景延伸。城市日光，建筑形成局部阴影。"},
      ],
      url: "./assets/inspiration/road.webm",
      posterUrl: "./assets/inspiration/road.webp",
      analysisVersion: "curated-v2",
    },
    {
      id: "inspiration-swim",
      file: "swim",
      title: "泳池 · 起跳与入水",
      duration: 5,
      sourceLabel: "Seedance",
      width: 640,
      height: 360,
      hasAudio: false,
      description: "从起跳台到水下的连续跟随，动作与镜头共同穿过水面。",
      tags: ["长镜头", "运动", "跟拍"],
      observations: [{"label": "动作与运镜", "text": "镜头与泳者一起越过水面，起跳的水平速度延续为水下的前进速度。"}, {"label": "空间", "text": "泳道浮标和池底线条持续交代方向，水面成为明暗与色彩的转换点。"}],
      shots: [
        {"id": "inspiration-swim-shot-1", "start": 0, "end": 5, "title": "入水跟随", "summary": "泳者从起跳台蹬出，镜头随身体跃入泳池，在水下继续跟随向前游动。", "framing": "全景转中景", "movement": "侧向跟随并穿过水面", "composition": "泳道形成纵深线，身体沿横向舒展", "light": "蓝色泳池与冷色顶光，水面折射清晰", "transition": "片段起始", "posterUrl": "./assets/inspiration/swim-shot-1.webp", "prompt": "泳者从起跳台蹬出，镜头随身体跃入泳池，在水下继续跟随向前游动。全景转中景，侧向跟随并穿过水面。泳道形成纵深线，身体沿横向舒展。蓝色泳池与冷色顶光，水面折射清晰。"},
      ],
      url: "./assets/inspiration/swim.webm",
      posterUrl: "./assets/inspiration/swim.webp",
      analysisVersion: "curated-v2",
    },
    {
      id: "inspiration-desert",
      file: "desert",
      title: "荒漠 · 棍术与远山",
      duration: 5,
      sourceLabel: "MultiShot",
      width: 640,
      height: 320,
      hasAudio: false,
      description: "以动作全景、迎面近景、背影和远景串联荒漠中的棍术展示。",
      tags: ["动作衔接", "空间尺度", "多镜头"],
      observations: [{"label": "景别节奏", "text": "全景交代棍术，迎面近景放大冲击，最后用背影和远景结束动作。"}, {"label": "尺度", "text": "棍端靠近镜头时占据前景，收尾人物缩为峡谷中的小点，形成明显尺度反差。"}],
      shots: [
        {"id": "inspiration-desert-shot-1", "start": 0, "end": 0.792, "title": "起势", "summary": "身穿红衣的猩猩在沙地上挥动长棍，双脚展开。", "framing": "全景", "movement": "稳定观察", "composition": "石柱分列两侧，人物居中", "light": "暖色日光，红色服装与沙岩形成色彩呼应", "transition": "片段起始", "posterUrl": "./assets/inspiration/desert-shot-1.webp", "prompt": "身穿红衣的猩猩在沙地上挥动长棍，双脚展开。全景，稳定观察。石柱分列两侧，人物居中。暖色日光，红色服装与沙岩形成色彩呼应。"},
        {"id": "inspiration-desert-shot-2", "start": 0.792, "end": 2.584, "title": "迎面出棍", "summary": "猩猩向镜头方向出棍，棍端快速放大。", "framing": "中近景", "movement": "正面迎接动作", "composition": "棍端指向镜头，人物居中", "light": "暖色日光，红色服装与沙岩形成色彩呼应", "transition": "切换至迎面出棍", "posterUrl": "./assets/inspiration/desert-shot-2.webp", "prompt": "猩猩向镜头方向出棍，棍端快速放大。中近景，正面迎接动作。棍端指向镜头，人物居中。暖色日光，红色服装与沙岩形成色彩呼应。"},
        {"id": "inspiration-desert-shot-3", "start": 2.584, "end": 3.625, "title": "背影停驻", "summary": "人物背对镜头，望向远处的峡谷。", "framing": "近景", "movement": "缓慢后退", "composition": "肩部作为前景，远山位于中心", "light": "暖色日光，红色服装与沙岩形成色彩呼应", "transition": "切换至背影停驻", "posterUrl": "./assets/inspiration/desert-shot-3.webp", "prompt": "人物背对镜头，望向远处的峡谷。近景，缓慢后退。肩部作为前景，远山位于中心。暖色日光，红色服装与沙岩形成色彩呼应。"},
        {"id": "inspiration-desert-shot-4", "start": 3.625, "end": 5, "title": "峡谷留白", "summary": "宽阔峡谷展开，红衣人物缩小为沙地上的一个点。", "framing": "远景", "movement": "平稳拉远", "composition": "高耸岩壁包围中央留白", "light": "暖色日光，红色服装与沙岩形成色彩呼应", "transition": "切换至峡谷留白", "posterUrl": "./assets/inspiration/desert-shot-4.webp", "prompt": "宽阔峡谷展开，红衣人物缩小为沙地上的一个点。远景，平稳拉远。高耸岩壁包围中央留白。暖色日光，红色服装与沙岩形成色彩呼应。"},
      ],
      url: "./assets/inspiration/desert.webm",
      posterUrl: "./assets/inspiration/desert.webp",
      analysisVersion: "curated-v2",
    },
    {
      id: "inspiration-morning",
      file: "morning",
      title: "林间 · 清晨苏醒",
      duration: 20,
      sourceLabel: "Big Buck Bunny · Blender Foundation",
      width: 640,
      height: 360,
      hasAudio: true,
      description: "从洞穴阴影走向阳光，利用景别和明暗变化完成角色出场。",
      tags: ["动画", "角色出场", "自然光"],
      observations: [{"label": "角色出场", "text": "先让角色从洞口阴影中显现，再展示伸展动作，最后转到面向天空的低角度近景。"}, {"label": "光线", "text": "洞口的深色轮廓衬托白色毛发，走出阴影后整体画面逐渐明亮。"}],
      shots: [
        {"id": "inspiration-morning-shot-1", "start": 0, "end": 7.708, "title": "洞口苏醒", "summary": "白兔在草坡洞口探出头，眯眼看向明亮的外部。", "framing": "中景", "movement": "稳定机位", "composition": "暗洞口包围角色，草叶形成边框", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "片段起始", "posterUrl": "./assets/inspiration/morning-shot-1.webp", "prompt": "白兔在草坡洞口探出头，眯眼看向明亮的外部。中景，稳定机位。暗洞口包围角色，草叶形成边框。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-morning-shot-2", "start": 7.708, "end": 16.083, "title": "伸展身体", "summary": "白兔走出洞穴，伸展双臂并活动身体。", "framing": "全景", "movement": "轻微随人物移动", "composition": "人物从洞口阴影进入草地亮部", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至伸展身体", "posterUrl": "./assets/inspiration/morning-shot-2.webp", "prompt": "白兔走出洞穴，伸展双臂并活动身体。全景，轻微随人物移动。人物从洞口阴影进入草地亮部。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-morning-shot-3", "start": 16.083, "end": 20, "title": "仰望天空", "summary": "白兔抬起头面向天空，长耳朵伸入蓝天。", "framing": "仰拍近景", "movement": "低角度观察", "composition": "天空大面积留白，树叶从边缘伸入", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至仰望天空", "posterUrl": "./assets/inspiration/morning-shot-3.webp", "prompt": "白兔抬起头面向天空，长耳朵伸入蓝天。仰拍近景，低角度观察。天空大面积留白，树叶从边缘伸入。明亮柔和的日光，草地反光照亮白色毛发。"},
      ],
      url: "./assets/inspiration/morning.webm",
      posterUrl: "./assets/inspiration/morning.webp",
      analysisVersion: "curated-v2",
    },
    {
      id: "inspiration-butterfly",
      file: "butterfly",
      title: "草地 · 蝴蝶与意外",
      duration: 30,
      sourceLabel: "Big Buck Bunny · Blender Foundation",
      width: 640,
      height: 360,
      hasAudio: true,
      description: "闻花、追蝶与果实落下交替推进，通过主观视角和反应镜头形成轻喜剧节奏。",
      tags: ["动画", "反应镜头", "视线衔接"],
      observations: [{"label": "视线组织", "text": "白兔闻花的近景与树上观察者的俯视交替，蝴蝶把视线从地面引向上方。"}, {"label": "喜剧节奏", "text": "较长的闻花和追蝶动作让注意力停留在角色上，果实突然落下带来打断，再以捡拾反应收束。"}],
      shots: [
        {"id": "inspiration-butterfly-shot-1", "start": 0, "end": 0.667, "title": "仰望", "summary": "白兔在树下仰头，耳朵伸向天空。", "framing": "仰拍近景", "movement": "稳定机位", "composition": "天空与树冠包围人物", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "片段起始", "posterUrl": "./assets/inspiration/butterfly-shot-1.webp", "prompt": "白兔在树下仰头，耳朵伸向天空。仰拍近景，稳定机位。天空与树冠包围人物。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-butterfly-shot-2", "start": 0.667, "end": 3.792, "title": "低头发现", "summary": "白兔低下头，目光落向前方花朵。", "framing": "中近景", "movement": "平稳跟随头部", "composition": "面部居中，浅色天空作为背景", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至低头发现", "posterUrl": "./assets/inspiration/butterfly-shot-2.webp", "prompt": "白兔低下头，目光落向前方花朵。中近景，平稳跟随头部。面部居中，浅色天空作为背景。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-butterfly-shot-3", "start": 3.792, "end": 9.417, "title": "凑近闻花", "summary": "白兔走近白色花朵，低头将鼻尖凑到花瓣旁。", "framing": "近景", "movement": "固定低机位", "composition": "花朵占据左前景，兔子从右后方靠近", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至凑近闻花", "posterUrl": "./assets/inspiration/butterfly-shot-3.webp", "prompt": "白兔走近白色花朵，低头将鼻尖凑到花瓣旁。近景，固定低机位。花朵占据左前景，兔子从右后方靠近。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-butterfly-shot-4", "start": 9.417, "end": 11.292, "title": "树上窥视", "summary": "树上小动物从枝叶间俯视草地里的白兔。", "framing": "俯拍远景", "movement": "固定机位", "composition": "树枝与果实形成前景框架", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至树上窥视", "posterUrl": "./assets/inspiration/butterfly-shot-4.webp", "prompt": "树上小动物从枝叶间俯视草地里的白兔。俯拍远景，固定机位。树枝与果实形成前景框架。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-butterfly-shot-5", "start": 11.292, "end": 13.458, "title": "闻花反应", "summary": "白兔闭上眼睛闻花，面部放松。", "framing": "特写", "movement": "稳定机位", "composition": "花瓣与鼻尖相邻，背景虚化", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至闻花反应", "posterUrl": "./assets/inspiration/butterfly-shot-5.webp", "prompt": "白兔闭上眼睛闻花，面部放松。特写，稳定机位。花瓣与鼻尖相邻，背景虚化。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-butterfly-shot-6", "start": 13.458, "end": 15.542, "title": "蝴蝶靠近", "summary": "紫色蝴蝶飞近，白兔睁眼并转动目光。", "framing": "近景", "movement": "轻微跟随表情", "composition": "花朵在左侧，蝴蝶进入视线方向", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至蝴蝶靠近", "posterUrl": "./assets/inspiration/butterfly-shot-6.webp", "prompt": "紫色蝴蝶飞近，白兔睁眼并转动目光。近景，轻微跟随表情。花朵在左侧，蝴蝶进入视线方向。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-butterfly-shot-7", "start": 15.542, "end": 19.958, "title": "蝴蝶掠过", "summary": "从上方看到蝴蝶掠过白兔的头顶，白兔抬头追随。", "framing": "俯拍中景", "movement": "跟随蝴蝶移动", "composition": "紫色蝴蝶与白色角色在绿色草地上突出", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至蝴蝶掠过", "posterUrl": "./assets/inspiration/butterfly-shot-7.webp", "prompt": "从上方看到蝴蝶掠过白兔的头顶，白兔抬头追随。俯拍中景，跟随蝴蝶移动。紫色蝴蝶与白色角色在绿色草地上突出。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-butterfly-shot-8", "start": 19.958, "end": 29.75, "title": "果实落下", "summary": "白兔仰望蝴蝶，红色果实突然落下，随后弯腰捡起果实。", "framing": "全景", "movement": "稳定机位", "composition": "角色居中，果实提供醒目的红色重心", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至果实落下", "posterUrl": "./assets/inspiration/butterfly-shot-8.webp", "prompt": "白兔仰望蝴蝶，红色果实突然落下，随后弯腰捡起果实。全景，稳定机位。角色居中，果实提供醒目的红色重心。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-butterfly-shot-9", "start": 29.75, "end": 30, "title": "转身", "summary": "白兔拿着果实转动身体。", "framing": "全景", "movement": "侧向观察", "composition": "角色与果实位于草地中央", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至转身", "posterUrl": "./assets/inspiration/butterfly-shot-9.webp", "prompt": "白兔拿着果实转动身体。全景，侧向观察。角色与果实位于草地中央。明亮柔和的日光，草地反光照亮白色毛发。"},
      ],
      url: "./assets/inspiration/butterfly.webm",
      posterUrl: "./assets/inspiration/butterfly.webp",
      analysisVersion: "curated-v2",
    },
    {
      id: "inspiration-tree",
      file: "tree",
      title: "树下 · 追逐与围观",
      duration: 30,
      sourceLabel: "Big Buck Bunny · Blender Foundation",
      width: 640,
      height: 360,
      hasAudio: true,
      description: "追逐蝴蝶的白兔与旁观的小动物交替出现，正反视角逐步揭示空间关系。",
      tags: ["动画", "群像", "视线衔接"],
      observations: [{"label": "空间关系", "text": "白兔的前进方向先由远景建立，再通过旁观者正反面与树干前的近景接续。"}, {"label": "注意力", "text": "前景遮挡、角色视线与蝴蝶运动接力，把焦点从开阔草地逐步带到树旁。"}],
      shots: [
        {"id": "inspiration-tree-shot-1", "start": 0, "end": 4.75, "title": "离开草地", "summary": "白兔拿着果实走出画面，蝴蝶飞向树林。", "framing": "全景", "movement": "固定机位", "composition": "草地与远处树列形成水平层次", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "片段起始", "posterUrl": "./assets/inspiration/tree-shot-1.webp", "prompt": "白兔拿着果实走出画面，蝴蝶飞向树林。全景，固定机位。草地与远处树列形成水平层次。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-tree-shot-2", "start": 4.75, "end": 8.917, "title": "树枝上的观察者", "summary": "小动物藏在树枝与果实之间，看着草地上的白兔。", "framing": "俯拍远景", "movement": "固定机位", "composition": "枝叶占前景，白兔位于画面深处", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至树枝上的观察者", "posterUrl": "./assets/inspiration/tree-shot-2.webp", "prompt": "小动物藏在树枝与果实之间，看着草地上的白兔。俯拍远景，固定机位。枝叶占前景，白兔位于画面深处。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-tree-shot-3", "start": 8.917, "end": 17.667, "title": "追随蝴蝶", "summary": "蝴蝶绕着白兔面前飞舞，白兔转头追随并向前跑去。", "framing": "中景", "movement": "跟随角色转头", "composition": "兔子与蝴蝶在天空和草地之间形成视线关系", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至追随蝴蝶", "posterUrl": "./assets/inspiration/tree-shot-3.webp", "prompt": "蝴蝶绕着白兔面前飞舞，白兔转头追随并向前跑去。中景，跟随角色转头。兔子与蝴蝶在天空和草地之间形成视线关系。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-tree-shot-4", "start": 17.667, "end": 22.958, "title": "跑向树林", "summary": "白兔朝树林跑远，几只小动物在前景观看。", "framing": "远景", "movement": "低角度稳定观察", "composition": "旁观者背影位于前景，白兔向纵深移动", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至跑向树林", "posterUrl": "./assets/inspiration/tree-shot-4.webp", "prompt": "白兔朝树林跑远，几只小动物在前景观看。远景，低角度稳定观察。旁观者背影位于前景，白兔向纵深移动。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-tree-shot-5", "start": 22.958, "end": 25.875, "title": "旁观者反应", "summary": "三只小动物站在一起，脸朝白兔离开的方向。", "framing": "中近景", "movement": "稳定机位", "composition": "三个不同体型并列形成群像", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至旁观者反应", "posterUrl": "./assets/inspiration/tree-shot-5.webp", "prompt": "三只小动物站在一起，脸朝白兔离开的方向。中近景，稳定机位。三个不同体型并列形成群像。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-tree-shot-6", "start": 25.875, "end": 28.458, "title": "树干前追蝶", "summary": "白兔仰头看着飞到树干前的蝴蝶。", "framing": "近景", "movement": "随仰头动作抬升", "composition": "树干作为竖直背景，蝴蝶位于上方", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至树干前追蝶", "posterUrl": "./assets/inspiration/tree-shot-6.webp", "prompt": "白兔仰头看着飞到树干前的蝴蝶。近景，随仰头动作抬升。树干作为竖直背景，蝴蝶位于上方。明亮柔和的日光，草地反光照亮白色毛发。"},
        {"id": "inspiration-tree-shot-7", "start": 28.458, "end": 30, "title": "树旁的小动物", "summary": "白兔的身体掠过前景，树旁的小动物露出身影。", "framing": "中景", "movement": "低机位观察", "composition": "白色身体形成前景遮挡", "light": "明亮柔和的日光，草地反光照亮白色毛发", "transition": "切换至树旁的小动物", "posterUrl": "./assets/inspiration/tree-shot-7.webp", "prompt": "白兔的身体掠过前景，树旁的小动物露出身影。中景，低机位观察。白色身体形成前景遮挡。明亮柔和的日光，草地反光照亮白色毛发。"},
      ],
      url: "./assets/inspiration/tree.webm",
      posterUrl: "./assets/inspiration/tree.webp",
      analysisVersion: "curated-v2",
    },
    {
      id: "inspiration-city",
      file: "city",
      title: "城市 · 屋顶警戒",
      duration: 30,
      sourceLabel: "Tears of Steel · Blender Foundation",
      width: 640,
      height: 268,
      hasAudio: true,
      description: "城市全景进入破损室内，瞄准视角与人物反应交替，逐步揭示屋顶上的威胁。",
      tags: ["科幻", "主观镜头", "悬念"],
      observations: [{"label": "悬念推进", "text": "从城市全景进入藏身处，再跟随人物视线切入瞄准镜，威胁随着搜索逐渐显露。"}, {"label": "主客观交替", "text": "目标视角与观察者特写交替；目标闪光后回到室内全景，把外部事件重新连接到人物处境。"}],
      shots: [
        {"id": "inspiration-city-shot-1", "start": 0, "end": 4.166, "title": "城市烟雾", "summary": "老城屋顶与钟楼笼罩在烟雾中。", "framing": "大全景", "movement": "缓慢移动", "composition": "屋顶密集铺开，钟楼形成竖向焦点", "light": "冷蓝色阴天光，室内阴影与窗外亮部形成反差", "transition": "片段起始", "posterUrl": "./assets/inspiration/city-shot-1.webp", "prompt": "老城屋顶与钟楼笼罩在烟雾中。大全景，缓慢移动。屋顶密集铺开，钟楼形成竖向焦点。冷蓝色阴天光，室内阴影与窗外亮部形成反差。"},
        {"id": "inspiration-city-shot-2", "start": 4.166, "end": 9.458, "title": "进入藏身处", "summary": "镜头穿过破损结构与线缆，靠近窗边的人物。", "framing": "全景", "movement": "缓慢前移", "composition": "黑暗前景框住远处明亮窗口", "light": "冷蓝色阴天光，室内阴影与窗外亮部形成反差", "transition": "切换至进入藏身处", "posterUrl": "./assets/inspiration/city-shot-2.webp", "prompt": "镜头穿过破损结构与线缆，靠近窗边的人物。全景，缓慢前移。黑暗前景框住远处明亮窗口。冷蓝色阴天光，室内阴影与窗外亮部形成反差。"},
        {"id": "inspiration-city-shot-3", "start": 9.458, "end": 12.208, "title": "报纸细节", "summary": "一张报纸盖住躺着的人，手部停在纸张旁。", "framing": "特写", "movement": "稳定观察", "composition": "报纸纹理充满画面", "light": "冷蓝色阴天光，室内阴影与窗外亮部形成反差", "transition": "切换至报纸细节", "posterUrl": "./assets/inspiration/city-shot-3.webp", "prompt": "一张报纸盖住躺着的人，手部停在纸张旁。特写，稳定观察。报纸纹理充满画面。冷蓝色阴天光，室内阴影与窗外亮部形成反差。"},
        {"id": "inspiration-city-shot-4", "start": 12.208, "end": 14.916, "title": "窗边瞄准", "summary": "人物趴在窗边，透过瞄准镜观察远方。", "framing": "中近景", "movement": "稳定侧面机位", "composition": "枪身与视线指向画面左侧", "light": "冷蓝色阴天光，室内阴影与窗外亮部形成反差", "transition": "切换至窗边瞄准", "posterUrl": "./assets/inspiration/city-shot-4.webp", "prompt": "人物趴在窗边，透过瞄准镜观察远方。中近景，稳定侧面机位。枪身与视线指向画面左侧。冷蓝色阴天光，室内阴影与窗外亮部形成反差。"},
        {"id": "inspiration-city-shot-5", "start": 14.916, "end": 22.5, "title": "锁定屋顶", "summary": "圆形瞄准镜视野扫过屋顶装置，逐渐稳定在目标上。", "framing": "主观远景", "movement": "横向搜索后稳定", "composition": "圆形暗边框住中央目标", "light": "冷蓝色阴天光，室内阴影与窗外亮部形成反差", "transition": "切换至锁定屋顶", "posterUrl": "./assets/inspiration/city-shot-5.webp", "prompt": "圆形瞄准镜视野扫过屋顶装置，逐渐稳定在目标上。主观远景，横向搜索后稳定。圆形暗边框住中央目标。冷蓝色阴天光，室内阴影与窗外亮部形成反差。"},
        {"id": "inspiration-city-shot-6", "start": 22.5, "end": 25.5, "title": "观察者特写", "summary": "贴近武器与观察者的脸，人物保持瞄准姿势。", "framing": "特写", "movement": "稳定机位", "composition": "武器形成斜向前景，眼睛位于上方", "light": "冷蓝色阴天光，室内阴影与窗外亮部形成反差", "transition": "切换至观察者特写", "posterUrl": "./assets/inspiration/city-shot-6.webp", "prompt": "贴近武器与观察者的脸，人物保持瞄准姿势。特写，稳定机位。武器形成斜向前景，眼睛位于上方。冷蓝色阴天光，室内阴影与窗外亮部形成反差。"},
        {"id": "inspiration-city-shot-7", "start": 25.5, "end": 28.291, "title": "目标闪光", "summary": "瞄准镜中的屋顶装置发出强光。", "framing": "主观远景", "movement": "保持目标居中", "composition": "亮点在圆形视野中心聚集", "light": "冷蓝色阴天光，室内阴影与窗外亮部形成反差", "transition": "切换至目标闪光", "posterUrl": "./assets/inspiration/city-shot-7.webp", "prompt": "瞄准镜中的屋顶装置发出强光。主观远景，保持目标居中。亮点在圆形视野中心聚集。冷蓝色阴天光，室内阴影与窗外亮部形成反差。"},
        {"id": "inspiration-city-shot-8", "start": 28.291, "end": 30, "title": "室内反应", "summary": "回到窗边全景，躺着的人与瞄准者同处一室。", "framing": "全景", "movement": "稳定机位", "composition": "躺卧人物在前景，瞄准者靠窗", "light": "冷蓝色阴天光，室内阴影与窗外亮部形成反差", "transition": "切换至室内反应", "posterUrl": "./assets/inspiration/city-shot-8.webp", "prompt": "回到窗边全景，躺着的人与瞄准者同处一室。全景，稳定机位。躺卧人物在前景，瞄准者靠窗。冷蓝色阴天光，室内阴影与窗外亮部形成反差。"},
      ],
      url: "./assets/inspiration/city.webm",
      posterUrl: "./assets/inspiration/city.webp",
      analysisVersion: "curated-v2",
    },
    {
      id: "inspiration-lab",
      file: "lab",
      title: "实验室 · 虚实交错",
      duration: 18.833,
      sourceLabel: "Tears of Steel · Blender Foundation",
      width: 640,
      height: 268,
      hasAudio: true,
      description: "全息影像、控制台、实验人员与餐盘上的脑形物件快速切换，形成诡异的科幻叙事。",
      tags: ["科幻", "霓虹", "多镜头"],
      observations: [{"label": "信息层次", "text": "全息界面建立环境，控制台细节与人物反应补充行动，最后将注意力集中到餐盘中的异物。"}, {"label": "色彩转折", "text": "前半段绿紫色光线密集交叠，最后转为暖色近景，使异物成为新的视觉重心。"}],
      shots: [
        {"id": "inspiration-lab-shot-1", "start": 0, "end": 4.167, "title": "全息界面", "summary": "悬浮的彩色界面与线框人形覆盖实验室空间。", "framing": "中景", "movement": "平稳移动", "composition": "半透明信息层与实体设备叠加", "light": "绿色与紫色全息光叠加，末段转为暖色室内光", "transition": "片段起始", "posterUrl": "./assets/inspiration/lab-shot-1.webp", "prompt": "悬浮的彩色界面与线框人形覆盖实验室空间。中景，平稳移动。半透明信息层与实体设备叠加。绿色与紫色全息光叠加，末段转为暖色室内光。"},
        {"id": "inspiration-lab-shot-2", "start": 4.167, "end": 5.5, "title": "调节控制台", "summary": "手指在排列紧密的旋钮和按钮间操作。", "framing": "特写", "movement": "稳定机位", "composition": "控制台占满画面，手从右侧进入", "light": "绿色与紫色全息光叠加，末段转为暖色室内光", "transition": "切换至调节控制台", "posterUrl": "./assets/inspiration/lab-shot-2.webp", "prompt": "手指在排列紧密的旋钮和按钮间操作。特写，稳定机位。控制台占满画面，手从右侧进入。绿色与紫色全息光叠加，末段转为暖色室内光。"},
        {"id": "inspiration-lab-shot-3", "start": 5.5, "end": 8.042, "title": "实验者", "summary": "男子坐在设备之间，脸部被半透明彩色图形覆盖。", "framing": "中近景", "movement": "稳定机位", "composition": "人物面部居中，界面构成前景", "light": "绿色与紫色全息光叠加，末段转为暖色室内光", "transition": "切换至实验者", "posterUrl": "./assets/inspiration/lab-shot-3.webp", "prompt": "男子坐在设备之间，脸部被半透明彩色图形覆盖。中近景，稳定机位。人物面部居中，界面构成前景。绿色与紫色全息光叠加，末段转为暖色室内光。"},
        {"id": "inspiration-lab-shot-4", "start": 8.042, "end": 11.042, "title": "实验空间", "summary": "两位实验人员在复杂仪器之间工作，全息文字悬在上方。", "framing": "全景", "movement": "稳定观察", "composition": "人物分居两侧，设备在中央形成纵深", "light": "绿色与紫色全息光叠加，末段转为暖色室内光", "transition": "切换至实验空间", "posterUrl": "./assets/inspiration/lab-shot-4.webp", "prompt": "两位实验人员在复杂仪器之间工作，全息文字悬在上方。全景，稳定观察。人物分居两侧，设备在中央形成纵深。绿色与紫色全息光叠加，末段转为暖色室内光。"},
        {"id": "inspiration-lab-shot-5", "start": 11.042, "end": 18.833, "title": "餐桌上的异物", "summary": "脑形物件放在白盘中，人物从后方靠近并观察。", "framing": "近景", "movement": "轻微推近", "composition": "盘子占前景，人物的脸位于后方", "light": "绿色与紫色全息光叠加，末段转为暖色室内光", "transition": "切换至餐桌上的异物", "posterUrl": "./assets/inspiration/lab-shot-5.webp", "prompt": "脑形物件放在白盘中，人物从后方靠近并观察。近景，轻微推近。盘子占前景，人物的脸位于后方。绿色与紫色全息光叠加，末段转为暖色室内光。"},
      ],
      url: "./assets/inspiration/lab.webm",
      posterUrl: "./assets/inspiration/lab.webp",
      analysisVersion: "curated-v2",
    },
    {
      id: "inspiration-rooftop",
      file: "rooftop",
      title: "屋顶 · 少女与飞龙",
      duration: 13.5,
      sourceLabel: "Sintel · Blender Foundation",
      width: 960,
      height: 400,
      hasAudio: true,
      description: "夕阳中的屋顶追逐在少女反应与飞龙动作之间切换，利用停顿与快速动作交替推进。",
      tags: ["幻想", "动作衔接", "逆光"],
      observations: [{"label": "动作连接", "text": "少女抬头建立视线，屋顶远景交代飞龙位置，空中追逐后切回面部反应。"}, {"label": "节奏停顿", "text": "快速飞行动作与面部特写交替，短暂落黑形成停顿，再进入少女与飞龙的接近。"}],
      shots: [
        {"id": "inspiration-rooftop-shot-1", "start": 0, "end": 1.792, "title": "抬头", "summary": "红发少女抬头望向天空，神情紧张。", "framing": "近景", "movement": "稳定观察", "composition": "面部居中，瓦砾位于下方", "light": "金色夕阳与暖色天空，人物边缘有明亮轮廓", "transition": "片段起始", "posterUrl": "./assets/inspiration/rooftop-shot-1.webp", "prompt": "红发少女抬头望向天空，神情紧张。近景，稳定观察。面部居中，瓦砾位于下方。金色夕阳与暖色天空，人物边缘有明亮轮廓。"},
        {"id": "inspiration-rooftop-shot-2", "start": 1.792, "end": 3.875, "title": "屋顶飞掠", "summary": "飞龙从夕阳下的屋顶掠过。", "framing": "远景", "movement": "横向跟随", "composition": "城市屋顶层层延伸，飞龙越过上方", "light": "金色夕阳与暖色天空，人物边缘有明亮轮廓", "transition": "切换至屋顶飞掠", "posterUrl": "./assets/inspiration/rooftop-shot-2.webp", "prompt": "飞龙从夕阳下的屋顶掠过。远景，横向跟随。城市屋顶层层延伸，飞龙越过上方。金色夕阳与暖色天空，人物边缘有明亮轮廓。"},
        {"id": "inspiration-rooftop-shot-3", "start": 3.875, "end": 5.417, "title": "空中追逐", "summary": "飞龙展开翅膀在空中追逐。", "framing": "中景", "movement": "快速跟随", "composition": "翅膀斜向穿过明亮天空", "light": "金色夕阳与暖色天空，人物边缘有明亮轮廓", "transition": "切换至空中追逐", "posterUrl": "./assets/inspiration/rooftop-shot-3.webp", "prompt": "飞龙展开翅膀在空中追逐。中景，快速跟随。翅膀斜向穿过明亮天空。金色夕阳与暖色天空，人物边缘有明亮轮廓。"},
        {"id": "inspiration-rooftop-shot-4", "start": 5.417, "end": 6.146, "title": "惊讶", "summary": "少女瞪大眼睛，画面短暂落黑。", "framing": "特写", "movement": "稳定机位", "composition": "眼睛与嘴部成为视觉焦点", "light": "金色夕阳与暖色天空，人物边缘有明亮轮廓", "transition": "切换至惊讶", "posterUrl": "./assets/inspiration/rooftop-shot-4.webp", "prompt": "少女瞪大眼睛，画面短暂落黑。特写，稳定机位。眼睛与嘴部成为视觉焦点。金色夕阳与暖色天空，人物边缘有明亮轮廓。"},
        {"id": "inspiration-rooftop-shot-5", "start": 6.146, "end": 9.458, "title": "伸手接近", "summary": "少女张开双臂，飞龙向她靠近。", "framing": "中景", "movement": "随动作轻微移动", "composition": "少女与飞龙在左右两侧形成联系", "light": "金色夕阳与暖色天空，人物边缘有明亮轮廓", "transition": "切换至伸手接近", "posterUrl": "./assets/inspiration/rooftop-shot-5.webp", "prompt": "少女张开双臂，飞龙向她靠近。中景，随动作轻微移动。少女与飞龙在左右两侧形成联系。金色夕阳与暖色天空，人物边缘有明亮轮廓。"},
        {"id": "inspiration-rooftop-shot-6", "start": 9.458, "end": 10.875, "title": "侧目", "summary": "少女转头看向身旁的飞龙，表情变化。", "framing": "特写", "movement": "稳定机位", "composition": "脸部在左侧，飞龙的翼膜掠过右侧", "light": "金色夕阳与暖色天空，人物边缘有明亮轮廓", "transition": "切换至侧目", "posterUrl": "./assets/inspiration/rooftop-shot-6.webp", "prompt": "少女转头看向身旁的飞龙，表情变化。特写，稳定机位。脸部在左侧，飞龙的翼膜掠过右侧。金色夕阳与暖色天空，人物边缘有明亮轮廓。"},
        {"id": "inspiration-rooftop-shot-7", "start": 10.875, "end": 13.5, "title": "飞龙相遇", "summary": "两只飞龙在空中靠近，翅膀交叠。", "framing": "近景", "movement": "跟随飞行", "composition": "龙身形成对角线，暖色天空留白", "light": "金色夕阳与暖色天空，人物边缘有明亮轮廓", "transition": "切换至飞龙相遇", "posterUrl": "./assets/inspiration/rooftop-shot-7.webp", "prompt": "两只飞龙在空中靠近，翅膀交叠。近景，跟随飞行。龙身形成对角线，暖色天空留白。金色夕阳与暖色天空，人物边缘有明亮轮廓。"},
      ],
      url: "./assets/inspiration/rooftop.webm",
      posterUrl: "./assets/inspiration/rooftop.webp",
      analysisVersion: "curated-v2",
    },
    {
      id: "inspiration-snow",
      file: "snow",
      title: "雪山 · 独行者",
      duration: 7,
      sourceLabel: "Sintel · Blender Foundation",
      width: 960,
      height: 400,
      hasAudio: true,
      description: "雪山远景转入人物近景，以风雪、留白与视线建立孤独的行进感。",
      tags: ["幻想", "空间尺度", "情绪"],
      observations: [{"label": "环境与人物", "text": "先用雪峰的宽阔留白建立距离，再转入人物近景，保持同一冷灰色环境。"}, {"label": "情绪", "text": "风雪弱化背景细节，围巾与面部成为注意焦点，缓慢移动保持艰难行进的感受。"}],
      shots: [
        {"id": "inspiration-snow-shot-1", "start": 0, "end": 3, "title": "雪峰", "summary": "积雪的山峰横贯远方，风雪在前景掠过。", "framing": "大全景", "movement": "缓慢横移", "composition": "山脊横向延伸，天空大面积留白", "light": "冷灰色漫射光，风雪降低远景对比", "transition": "片段起始", "posterUrl": "./assets/inspiration/snow-shot-1.webp", "prompt": "积雪的山峰横贯远方，风雪在前景掠过。大全景，缓慢横移。山脊横向延伸，天空大面积留白。冷灰色漫射光，风雪降低远景对比。"},
        {"id": "inspiration-snow-shot-2", "start": 3, "end": 7, "title": "风雪中的人", "summary": "披着围巾的少女在雪中前行，抬头看向前方。", "framing": "中近景", "movement": "迎着人物缓慢移动", "composition": "人物在中央，雪山退到背景", "light": "冷灰色漫射光，风雪降低远景对比", "transition": "切换至风雪中的人", "posterUrl": "./assets/inspiration/snow-shot-2.webp", "prompt": "披着围巾的少女在雪中前行，抬头看向前方。中近景，迎着人物缓慢移动。人物在中央，雪山退到背景。冷灰色漫射光，风雪降低远景对比。"},
      ],
      url: "./assets/inspiration/snow.webm",
      posterUrl: "./assets/inspiration/snow.webp",
      analysisVersion: "curated-v2",
    },
  ].map((clip) => Object.freeze({ ...clip, shots: Object.freeze(clip.shots.map((shot) => Object.freeze(shot))) }));
  const byId = new Map(clips.map((clip) => [clip.id, clip]));

  // These facets describe visible features in the curated clips, not inferred camera equipment
  // or techniques for which the local catalog has no example.
  const discoveryFacets = Object.freeze([
    { id: "content", label: "内容", options: [
      { id: "content:people", label: "人物", aliases: ["人物动作", "角色", "人像", "people", "character"] },
      { id: "content:animals", label: "动物", aliases: ["动物角色", "animals"] },
      { id: "content:nature", label: "自然", aliases: ["风景", "自然环境", "landscape", "nature"] },
      { id: "content:city", label: "城市", aliases: ["街道", "都市", "city", "urban"] },
      { id: "content:scifi", label: "科幻", aliases: ["science fiction", "sci-fi"] },
      { id: "content:fantasy", label: "奇幻", aliases: ["幻想", "fantasy"] },
      { id: "content:water", label: "水中", aliases: ["水下", "游泳", "underwater", "water"] },
      { id: "content:vehicles", label: "载具", aliases: ["车辆", "汽车", "vehicle", "car"] },
    ] },
    { id: "scale", label: "景别", options: [
      { id: "scale:extreme-wide", label: "大全景", aliases: ["extreme wide shot"] },
      { id: "scale:long", label: "远景", aliases: ["远距离景别", "long shot"] },
      { id: "scale:wide", label: "全景", aliases: ["全身景别", "wide shot", "full shot"] },
      { id: "scale:medium", label: "中景", aliases: ["medium shot"] },
      { id: "scale:medium-close", label: "中近景", aliases: ["medium close up"] },
      { id: "scale:close", label: "近景", aliases: ["近距离景别", "close shot"] },
      { id: "scale:close-up", label: "特写", aliases: ["close up", "close-up"] },
    ] },
    { id: "movement", label: "运镜", options: [
      { id: "movement:tracking", label: "跟拍", description: "镜头跟随人物、动物或载具运动", aliases: ["跟随", "跟踪镜头", "tracking", "follow"] },
      { id: "movement:push-in", label: "推进", description: "镜头逐渐靠近画面主体", aliases: ["推近", "靠近", "push in", "dolly in"] },
      { id: "movement:pull-out", label: "拉远", description: "镜头后退，逐步展开环境", aliases: ["后退", "拉镜头", "pull out", "dolly out"] },
      { id: "movement:lateral", label: "横移", description: "镜头横向移动或随主体横向运动", aliases: ["横向移动", "侧向移动", "lateral"] },
      { id: "movement:static", label: "固定机位", description: "包含机位稳定、以主体动作为主的镜头", aliases: ["静态镜头", "稳定机位", "static", "locked off"] },
    ] },
    { id: "light", label: "光影", options: [
      { id: "light:daylight", label: "自然光", aliases: ["日光", "白天", "daylight", "natural light"] },
      { id: "light:backlight", label: "逆光", aliases: ["轮廓光", "侧逆光", "backlight", "rim light"] },
      { id: "light:soft", label: "柔光", aliases: ["漫射光", "阴天", "soft light", "diffused light"] },
      { id: "light:colored", label: "彩色光", aliases: ["霓虹", "全息光", "neon", "colored light"] },
      { id: "light:warm", label: "暖色调", aliases: ["暖光", "金色", "warm"] },
      { id: "light:cool", label: "冷色调", aliases: ["冷光", "冷灰", "cool"] },
    ] },
    { id: "composition", label: "构图", options: [
      { id: "composition:depth", label: "前景纵深", aliases: ["前景层次", "纵深", "depth", "foreground"] },
      { id: "composition:negative-space", label: "留白", aliases: ["空间尺度", "空旷", "negative space"] },
      { id: "composition:frame", label: "框架构图", aliases: ["框中框", "frame within frame"] },
      { id: "composition:pov", label: "主观视角", aliases: ["主观镜头", "第一人称", "pov", "point of view"] },
    ] },
    { id: "editing", label: "剪辑", options: [
      { id: "editing:continuous", label: "连续长镜头", aliases: ["一镜到底", "长镜头", "one take", "long take"] },
      { id: "editing:dissolve", label: "叠化", aliases: ["溶解转场", "叠化转场", "dissolve", "crossfade"] },
      { id: "editing:reaction", label: "反应切换", aliases: ["反应镜头", "视线衔接", "reaction shot", "eyeline"] },
      { id: "editing:action", label: "动作衔接", aliases: ["动作剪辑", "动作连接", "action continuity"] },
    ] },
    { id: "duration", label: "片段时长", options: [
      { id: "duration:short", label: "10 秒以内", description: "完整片段时长不超过 10 秒（含 10 秒）", aliases: ["短片段", "up to 10 seconds"] },
      { id: "duration:medium", label: "10–20 秒", description: "完整片段时长大于 10 秒、不超过 20 秒（含 20 秒）", aliases: ["10 to 20 seconds"] },
      { id: "duration:long", label: "20 秒以上", description: "完整片段时长大于 20 秒（不含 20 秒）", aliases: ["长片段", "over 20 seconds"] },
    ] },
  ].map((group) => Object.freeze({ ...group, options: Object.freeze(group.options.map((option) => Object.freeze({
    ...option, groupId: group.id, aliases: Object.freeze(option.aliases),
  }))) })));
  const discoveryOptions = new Map(discoveryFacets.flatMap((group) => group.options.map((option) => [option.id, option])));
  const discoveryMembership = new Map(Object.entries({
    "inspiration-coast": ["content:people", "content:nature", "content:water", "movement:tracking", "movement:lateral", "movement:static", "light:daylight", "light:warm", "editing:dissolve", "editing:action"],
    "inspiration-moon": ["content:people", "content:scifi", "content:vehicles", "movement:tracking", "movement:push-in", "movement:lateral", "movement:static", "light:backlight", "composition:negative-space", "composition:depth", "editing:action"],
    "inspiration-road": ["content:people", "content:city", "content:vehicles", "movement:tracking", "movement:push-in", "light:daylight", "composition:depth"],
    "inspiration-swim": ["content:people", "content:water", "movement:tracking", "movement:lateral", "light:cool", "composition:depth", "editing:continuous"],
    "inspiration-desert": ["content:animals", "content:nature", "content:fantasy", "movement:pull-out", "movement:static", "light:daylight", "light:warm", "composition:negative-space", "composition:depth", "editing:action"],
    "inspiration-morning": ["content:animals", "content:nature", "movement:static", "light:daylight", "light:soft", "composition:frame", "composition:negative-space", "editing:action"],
    "inspiration-butterfly": ["content:animals", "content:nature", "movement:tracking", "movement:static", "light:daylight", "light:soft", "composition:frame", "composition:depth", "composition:pov", "editing:reaction"],
    "inspiration-tree": ["content:animals", "content:nature", "movement:static", "light:daylight", "light:soft", "composition:depth", "editing:reaction"],
    "inspiration-city": ["content:people", "content:city", "content:scifi", "movement:push-in", "movement:static", "light:cool", "light:soft", "composition:frame", "composition:pov", "composition:depth", "editing:reaction"],
    "inspiration-lab": ["content:people", "content:scifi", "movement:push-in", "movement:static", "light:colored", "light:warm", "composition:depth"],
    "inspiration-rooftop": ["content:people", "content:city", "content:fantasy", "movement:tracking", "movement:lateral", "movement:static", "light:daylight", "light:backlight", "light:warm", "composition:depth", "composition:negative-space", "editing:reaction", "editing:action"],
    "inspiration-snow": ["content:people", "content:nature", "content:fantasy", "movement:lateral", "light:daylight", "light:soft", "light:cool", "composition:negative-space"],
  }).map(([id, tags]) => [id, new Set(tags)]));

  // Framing is derived only from explicit shot annotations. Longest terms win so
  // 中近景 and 大全景 do not silently acquire their substring categories.
  const framingIds = new Map(discoveryFacets.find((group) => group.id === "scale").options.map((option) => [option.label, option.id]));
  for (const clip of clips) {
    const membership = discoveryMembership.get(clip.id);
    for (const shot of clip.shots) {
      const scales = String(shot.framing ?? "").match(/大全景|中近景|特写|近景|中景|全景|远景/gu) || [];
      for (const scale of scales) membership.add(framingIds.get(scale));
    }
    // Use source seconds, not the rounded duration shown on cards. A 10.008 s
    // clip belongs to the middle bucket; exactly 20 s still belongs there.
    if (Number.isFinite(clip.duration) && clip.duration > 0) {
      membership.add(clip.duration <= 10 ? "duration:short" : clip.duration <= 20 ? "duration:medium" : "duration:long");
    }
  }

  function getDiscoveryTags(clipOrId) {
    const ids = discoveryMembership.get(typeof clipOrId === "string" ? clipOrId : clipOrId?.id);
    return ids ? [...discoveryOptions.values()].filter((option) => ids.has(option.id)) : [];
  }

  function normalizeDiscoveryText(value) {
    return String(value ?? "").normalize("NFKC").toLocaleLowerCase().trim();
  }

  const discoverySearchText = new Map(clips.map((clip) => [clip.id, normalizeDiscoveryText([
    clip.title, clip.description, clip.sourceLabel, ...clip.tags,
    ...clip.observations.flatMap((item) => [item.label, item.text]),
    ...clip.shots.flatMap((shot) => [shot.title, shot.summary, shot.framing, shot.movement, shot.composition, shot.light, shot.transition, shot.prompt]),
    ...getDiscoveryTags(clip).flatMap((option) => [option.label, ...option.aliases]),
  ].join(" "))]));

  function search({ query = "", facets = [] } = {}) {
    const terms = normalizeDiscoveryText(query).split(/\s+/u).filter(Boolean);
    const groups = new Map();
    for (const id of facets) {
      const option = discoveryOptions.get(id);
      // Unknown selections must not silently widen a narrowed search.
      if (!option) return [];
      if (!groups.has(option.groupId)) groups.set(option.groupId, new Set());
      groups.get(option.groupId).add(id);
    }
    return clips.filter((clip) => {
      const text = discoverySearchText.get(clip.id);
      const tags = discoveryMembership.get(clip.id);
      return terms.every((term) => text.includes(term))
        && [...groups.values()].every((selected) => [...selected].some((id) => tags.has(id)));
    });
  }

  function mediaFor(clip) {
    return { id: clip.id, mediaKind: "video", type: "video", name: `${clip.title}.webm`, displayName: clip.title,
      url: clip.url, thumbnailUrl: clip.posterUrl, posterUrl: clip.posterUrl,
      contentType: "video/webm", width: clip.width, height: clip.height, aspectRatio: clip.width / clip.height,
      duration: clip.duration, description: [clip.description, clip.sourceLabel, ...clip.observations.map((item) => item.text)].join(" "),
      tags: clip.tags, source: "platform", platformSourceId: clip.id, sourceCatalogId: "reelay-inspiration" };
  }

  function withLibrarySeed(seed) {
    const retired = new Set(seed.placements.filter((item) => item.space === "platform").map((item) => item.item.id));
    return { ...seed,
      media: [...seed.media.filter((item) => !retired.has(item.id)), ...clips.map(mediaFor)],
      folders: seed.folders.filter((item) => item.space !== "platform"),
      placements: [...seed.placements.filter((item) => item.space !== "platform"), ...clips.map((clip) => ({
        item: { kind: "media", id: clip.id }, space: "platform", folderId: null,
        tagIds: clip.tags.map((tag) => `inspiration:${tag}`), tags: clip.tags,
      }))],
    };
  }

  function timecode(seconds) {
    const rounded = Math.max(0, Math.round(Number(seconds) * 10) || 0);
    return `${String(Math.floor(rounded / 600)).padStart(2, "0")}:${String(Math.floor(rounded / 10) % 60).padStart(2, "0")}.${rounded % 10}`;
  }

  function validateRange({ clip, start, end }) {
    if (!clip || !byId.has(clip.id)) throw new Error("片段已不可用");
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > byId.get(clip.id).duration || end - start < 0.1 - 1e-6) {
      throw new Error("请选择有效时间段，结束时间须晚于开始时间且不超过片段时长");
    }
  }




  function getAnalysis({ clip, start, end }) {
    validateRange({ clip, start, end });
    const source = byId.get(clip.id);
    const shots = source.shots.filter((shot) => shot.end > start && shot.start < end).map((shot) => {
      const partial = start > shot.start || end < shot.end;
      const summary = partial ? `${shot.title}的局部画面。` : shot.summary;
      return { ...shot, sourceStart: shot.start, sourceEnd: shot.end, partial,
        start: Math.max(start, shot.start), end: Math.min(end, shot.end),
        sourceSummary: shot.summary, summary,
        // A cropped moment cannot promise a full multi-action sequence.
        prompt: partial ? `${shot.framing}，${shot.movement}。${shot.composition}。${shot.light}。` : shot.prompt,
        transition: start > shot.start ? "镜头内起点" : shot.transition,
      };
    });
    let coveredUntil = start;
    for (const shot of shots) {
      if (shot.start > coveredUntil + 1e-6) throw new Error("此选段尚无完整镜头分析");
      coveredUntil = shot.end;
    }
    if (coveredUntil < end - 1e-6) throw new Error("此选段尚无完整镜头分析");
    const prompt = shots.map((shot, index) => `镜头 ${index + 1}（${timecode(shot.start - start)}–${timecode(shot.end - start)}）：${shot.prompt}`).join("\n\n");
    return { key: `${source.id}:${analysisVersion}:${start}:${end}`, version: analysisVersion, start, end, shots,
      overview: start === 0 && end === source.duration ? source.observations.map((item) => ({ ...item })) : [
        { label: "画面结构", text: shots.map((shot) => shot.title).join(" → ") },
        { label: "景别与运动", text: shots.map((shot) => `${shot.framing}，${shot.movement}`).join("；") },
      ], prompt };
  }

  function makeAnalysisBrief({ clip, start, end, prompt, shotId = "" }) {
    validateRange({ clip, start, end });
    if (typeof prompt !== "string" || !prompt.trim()) throw new Error("请填写生成提示词");
    if (prompt.length > 12000) throw new Error("生成提示词不能超过 12000 字符");
    const source = byId.get(clip.id);
    const shot = shotId ? getAnalysis({ clip: source, start, end }).shots.find((item) => item.id === shotId) : null;
    if (shotId && !shot) throw new Error("所选镜头不在当前参考范围内");
    const rangeStart = shot ? shot.start : start;
    const rangeEnd = shot ? shot.end : end;
    return [
      `片段：《${source.title}》${shot ? ` · ${shot.title}` : ""}`,
      `来源：${source.sourceLabel}`,
      `参考范围：${timecode(rangeStart)}–${timecode(rangeEnd)}（附带完整片段，未裁切）`,
      "", prompt.trim(),
    ].join("\n");
  }

  root.REELAY_INSPIRATION_CATALOG = Object.freeze({ clips: Object.freeze(clips), get: (id) => byId.get(id) || null,
    attributionUrl: "./assets/inspiration/ATTRIBUTION.txt",
    discoveryFacets, search, getDiscoveryTags,
    mediaFor, withLibrarySeed, getAnalysis, makeAnalysisBrief, validateRange, timecode });
})(typeof globalThis === "object" ? globalThis : window);
