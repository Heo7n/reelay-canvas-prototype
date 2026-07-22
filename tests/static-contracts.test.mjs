import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [appSource, appCss, html, homeHtml, homeSource, homeConfig, homeCss, loginHtml, loginSource, loginCss] = await Promise.all([
  readFile(new URL("app.js", root), "utf8"),
  readFile(new URL("styles/app.css", root), "utf8"),
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("home.html", root), "utf8"),
  readFile(new URL("src/home/index.js", root), "utf8"),
  readFile(new URL("src/config/home-prototype-config.js", root), "utf8"),
  readFile(new URL("styles/home.css", root), "utf8"),
  readFile(new URL("login.html", root), "utf8"),
  readFile(new URL("src/login/index.js", root), "utf8"),
  readFile(new URL("styles/login.css", root), "utf8"),
]);

test("a fresh page lifecycle retains the 3000 / 0 credit contract", () => {
  assert.match(
    appSource,
    /account:\s*\{\s*credits:\s*3000,\s*consumedCredits:\s*0,?\s*\}/,
  );
  assert.match(html, /id="avatarCreditBadge"[^>]*>[\s\S]*?data-lucide="sparkles"[\s\S]*?id="avatarCreditValue">3000<\/span>/);
  assert.doesNotMatch(html, /id="avatarCreditBadge"[^>]*(?:role="button"|tabindex=)/);
  assert.doesNotMatch(appSource, /avatarCreditBadge\?\.addEventListener/);
});

test("a successful result locks its generator node to one media modality", () => {
  assert.match(appSource, /lockedMode:\s*null/);
  assert.match(appSource, /function getNodeLockedMode\(node\)/);
  assert.match(appSource, /normalizeGeneratorMode\(node\.generatedAsset\?\.type\)/);
  assert.match(appSource, /node\.lockedMode = outputMode/);
  assert.match(appSource, /if \(!canUseModelForNode\(node, selected\)\)/);
  assert.match(appSource, /const visibleTypes = lockedMode[\s\S]*types\.filter/);
  assert.match(appSource, /disabled aria-disabled="true" title=/);
  assert.match(appSource, /已生成\$\{lockedMode === "image" \? "图片" : "视频"\}，此节点仅可继续使用/);
  assert.doesNotMatch(appSource, /如需切换类型，请新建节点/);
  assert.match(appSource, /class="chip-icon"><i data-lucide="box"/);
  assert.match(appSource, /class="model-icon">\$\{item\.icon\}/);
  assert.match(appSource, /class="agent-model-provider">\$\{escapeHtml\(model\.icon\)\}/);
  assert.match(appSource, /"box":\s*'<path/);
  assert.match(html, /id="agentModelBtn"[\s\S]*?data-lucide="box"/);
  assert.match(appSource, /commitGenerationUndoBoundary\(canvas, node\.id\)/);
  assert.match(appSource, /action\.type === "node-update" && action\.node\?\.id === nodeId/);
  assert.match(appCss, /\.mode-tab:disabled/);
  assert.match(appCss, /\.model-mode-lock/);
});

test("model data and prototype config load before the application", () => {
  const catalogIndex = html.indexOf("./data/model-catalog.js");
  const configIndex = html.indexOf("./src/config/prototype-config.js");
  const appIndex = html.indexOf("./app.js");
  assert.ok(catalogIndex >= 0 && catalogIndex < configIndex && configIndex < appIndex);
});

test("the current prototype still starts with the Agent panel closed", () => {
  assert.match(appSource, /\bsetAgentOpen\(false\);/);
});

test("the logged-in home keeps the mock credit contract and account entry", () => {
  assert.match(homeHtml, /id="homeCreditButton"[^>]*aria-label="可用积分 3000"/);
  assert.match(homeHtml, /id="homeProfileButton"/);
  assert.doesNotMatch(homeHtml, /homeProfileButton[^>]*chevron/i);
});

test("home and canvas keep a reversible two-way entry contract", () => {
  assert.match(homeHtml, /href="\.\/index\.html"/);
  assert.match(appSource, /window\.location\.assign\("\.\/home\.html"\)/);
  assert.match(appSource, /window\.location\.assign\("\.\/home\.html#all-projects"\)/);
});

test("all projects is an accessible quick page state with a stable hash contract", () => {
  assert.match(homeHtml, /id="allProjectsView"[^>]*aria-hidden="true"[^>]*inert[^>]*hidden/);
  assert.match(homeHtml, /id="allProjectsTrigger"[^>]*aria-controls="allProjectsView"/);
  assert.match(homeSource, /history\.pushState\(\{ reelaySubview: "all-projects" \}/);
  assert.match(homeSource, /homeMain\.inert = open/);
  assert.match(homeSource, /homeMain\.hidden = open/);
  assert.match(homeSource, /allProjectsView\.hidden = !open/);
  assert.match(homeSource, /project\.image\s*\?/);
  assert.match(homeConfig, /const recentProjects = allProjects\.slice\(0, 4\)/);
  assert.match(homeSource, /project-card project-create-card/);
  assert.match(homeSource, /shouldOpen !== allProjectsOpen/);
  assert.match(homeSource, /setAllProjectsOpen\(true, \{ focus: true \}\)/);
  assert.doesNotMatch(homeSource, /transitionend|classList\.add\("is-open"\)/);
  assert.match(homeHtml, />个人<\/button>/);
  assert.match(homeHtml, />协作项目<\/button>/);
  assert.doesNotMatch(homeHtml, /PROJECT WORKSPACE|集中查看个人与组织项目|交互原型示例<\/span>/);
  assert.match(homeSource, /library-project-card library-project-create/);
  assert.match(homeSource, /<strong>新建项目<\/strong>/);
  assert.match(homeCss, /project-scope-switch button\[aria-pressed="true"\]::after/);
  assert.doesNotMatch(homeCss, /\.all-projects-view\s*\{[^}]*position:\s*fixed/);
  assert.match(homeSource, /focus\(\{ preventScroll: true \}\)/);
  assert.match(homeSource, /projectsBackgroundScrollY = window\.scrollY/);
  assert.match(homeSource, /window\.scrollTo\(\{ top: projectsBackgroundScrollY/);
});

test("project cards share an honest action menu and mark collaboration projects", () => {
  assert.match(homeHtml, /id="projectContextMenu"[^>]*role="menu"/);
  assert.match(homeHtml, /data-project-action="rename">重命名<\/button>/);
  assert.match(homeHtml, /data-project-action="cover">修改封面<\/button>/);
  assert.match(homeHtml, /data-project-action="collaborate">转为协作项目<\/button>/);
  assert.match(homeHtml, /data-project-action="delete">删除项目<\/button>/);
  assert.doesNotMatch(homeHtml, /创建副本/);
  assert.doesNotMatch(homeHtml, /移动至文件夹/);
  assert.match(homeSource, /data-project-menu-trigger/);
  assert.match(homeSource, /project\.workspace === "organization"/);
  assert.match(homeSource, /data-lucide="users-round"/);
  assert.match(homeSource, /项目数据持久化接入后可用/);
  assert.match(homeSource, /data-project-rename-trigger/);
  assert.match(homeSource, /projectTitleOverrides\.set\(projectId, nextTitle\)/);
  assert.match(homeSource, /已在本次演示中重命名为/);
  assert.match(homeCss, /\.project-context-menu\s*\{/);
  assert.match(homeCss, /\.project-collaboration-badge\s*\{/);
  assert.match(homeCss, /\.project-menu-trigger\s*\{[^}]*top:\s*10px/s);
  assert.match(homeCss, /\.project-collaboration-badge\s*\{[^}]*right:\s*12px;[^}]*bottom:\s*13px/s);
  assert.match(homeCss, /\.project-info:hover \.project-quick-rename/);
  assert.match(homeCss, /@media \(min-width: 901px\) and \(min-height: 1050px\)/);
  assert.match(homeConfig, /editedAt: "今天 14:32"/);
  assert.doesNotMatch(homeConfig, /\bmeta:/);
  assert.doesNotMatch(homeConfig, /editedAt:[^\n]*·/);
});

test("a home creation intent is consumed once by the canvas", () => {
  assert.match(homeSource, /sessionStorage\.setItem\(launchIntentKey, prompt\)/);
  assert.match(appSource, /sessionStorage\.getItem\(homeLaunchIntentKey\)/);
  assert.match(appSource, /sessionStorage\.removeItem\(homeLaunchIntentKey\)/);
});

test("home composer protects Chinese IME input and labels prototype shortcuts honestly", () => {
  assert.match(homeSource, /event\.isComposing/);
  assert.match(homeSource, /主页素材添加尚未接入/);
  assert.match(homeSource, /主页图片添加尚未接入/);
});

test("home project covers are local, purposeful prototype assets", () => {
  assert.match(homeConfig, /\.\/assets\/home\/project-perfume\.webp/);
  assert.match(homeConfig, /\.\/assets\/home\/project-education\.webp/);
  assert.doesNotMatch(homeConfig, /https?:\/\//);
});

test("login is a local account-password demo without fake authentication state", () => {
  assert.match(loginHtml, /value="tianmaochao@reelay\.test"/);
  assert.match(homeHtml, /t\*\*\*@reelay\.test/);
  assert.match(html, /t\*\*\*@reelay\.test/);
  assert.match(loginHtml, /type="password"[^>]*value="reelay-demo"/);
  assert.match(loginHtml, /autocomplete="username"/);
  assert.match(loginHtml, /autocomplete="current-password"/);
  assert.match(loginHtml, /\.\/assets\/auth\/login-studio\.webp/);
  assert.match(loginHtml, /使用 Google 继续/);
  assert.match(loginHtml, /data-prototype-message=/);
  assert.doesNotMatch(loginHtml, /login-visual-copy/);
  assert.match(loginSource, /showNotice\("已暂时填入演示账号/);
  assert.match(loginSource, /Google 登录目前是界面演示/);
  assert.match(loginCss, /mask-image:\s*linear-gradient/);
  assert.match(loginSource, /请勿输入真实账号密码/);
  assert.match(loginSource, /window\.location\.assign\("\.\/home\.html"\)/);
  assert.doesNotMatch(loginSource, /(?:localStorage|sessionStorage)\.setItem/);
  assert.doesNotMatch(loginSource, /document\.cookie|\bfetch\s*\(/);
  assert.doesNotMatch(loginSource, /accounts\.google\.com|oauth/i);
});

test("all three static entries use the local fixed icon runtime", () => {
  for (const page of [html, homeHtml, loginHtml]) {
    assert.match(page, /\.\/vendor\/lucide-1\.25\.0\.min\.js/);
    assert.doesNotMatch(page, /unpkg\.com|cdn\.jsdelivr\.net/);
  }
});

test("the demo account flow can return to login from home and canvas", () => {
  assert.match(homeHtml, /href="\.\/login\.html"[^>]*>[\s\S]*?退出演示账号/);
  assert.match(appSource, /window\.location\.assign\("\.\/login\.html"\)/);
  assert.match(html, /退出演示账号/);
});
