import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-media-image-view.js", import.meta.url), "utf8");
const origin = "http://reelay.test";
const original = `${origin}/api/workspaces/workspace-1/media-assets/image-1/content`;
const asset = { id: "image-1", type: "image", url: original, width: 2048, height: 3072 };

function setup(t) {
  const dom = new JSDOM("<main></main>", { url: origin, runScripts: "outside-only" });
  t.after(() => dom.window.close());
  dom.window.eval(source);
  const api = dom.window.REELAY_CANVAS_MEDIA_IMAGE_VIEW;
  const view = api.createCanvasMediaImageView({ origin });
  const container = dom.window.document.querySelector("main");
  function mount(input = asset, options = {}) {
    container.innerHTML = view.renderImage(input, { className: "frame-media", displayWidth: 600, ...options });
    view.syncImages(container, { scale: 0.41 });
    return container.querySelector("img");
  }
  function fire(image, type, currentSrc) {
    Object.defineProperty(image, "currentSrc", { configurable: true, value: currentSrc });
    image.dispatchEvent(new dom.window.Event(type));
  }
  return { ...api, view, container, mount, fire, window: dom.window };
}

test("responsive portrait, landscape and square candidates describe actual preview widths", (t) => {
  const { getImageSources } = setup(t);
  for (const [width, height, expected] of [[2048, 3072, 341], [3072, 2048, 512], [2048, 2048, 512]]) {
    const result = getImageSources({ ...asset, width, height }, { origin });
    assert.equal(result.previewWidth, expected);
    assert.equal(result.originalWidth, width);
    assert.equal(result.preview, `${original}?preview=canvas`);
    assert.equal(result.original, original);
  }
});

test("only same-origin authorized asset content routes receive a preview variant", (t) => {
  const { getImageSources } = setup(t);
  const project = "/api/projects/project-1/asset-references/reference-1/content";
  assert.equal(getImageSources({ ...asset, url: project }, { origin }).preview, `${origin}${project}?preview=canvas`);
  for (const url of [
    "blob:http://reelay.test/image-1", "data:image/png;base64,aGVsbG8=", "https://other.test/api/workspaces/w/media-assets/a/content",
    "/assets/home/entity-umbra-main-v4.png", "/assets/experience-preview/fixture.webp", "/api/unknown/content",
    `${original}?download=1`, `${original}#fragment`, `${origin}/api/workspaces/w/media-assets/a/content/extra`,
  ]) {
    const result = getImageSources({ ...asset, url }, { origin });
    assert.equal(result.preview, "", url);
    assert.equal(result.original, url);
  }
});

test("unknown dimensions, small originals, other media and known animation keep their originals", (t) => {
  const { getImageSources, mount } = setup(t);
  for (const change of [
    { width: undefined }, { height: 0 }, { width: Infinity }, { width: 200, height: 300 },
    { type: "video" }, { type: "audio" }, { contentType: "image/gif" }, { mimeType: "image/gif" },
    { name: "animation.gif" }, { animated: true }, { isAnimated: true }, { frameCount: 2 },
  ]) assert.equal(getImageSources({ ...asset, ...change }, { origin }).preview, "", JSON.stringify(change));
  const image = mount({ ...asset, width: undefined });
  assert.equal(image.getAttribute("src"), original);
  assert.equal(image.hasAttribute("srcset"), false);
});

test("first render only offers the preview; zoom upgrades the same image when its physical width exceeds it", (t) => {
  const { view, container, mount } = setup(t);
  const image = mount();
  assert.equal(image.getAttribute("sizes"), "246px");
  assert.equal(image.getAttribute("srcset"), `${original}?preview=canvas 341w`);
  assert.equal(image.getAttribute("src"), `${original}?preview=canvas`);
  assert.equal(image.hasAttribute("loading"), false, "canvas panning must not depend on native lazy-load viewport heuristics");
  view.syncImages(container, { scale: 2, displayWidth: 600 });
  assert.equal(container.querySelector("img"), image);
  assert.equal(image.hasAttribute("sizes"), false);
  assert.equal(image.hasAttribute("srcset"), false);
  assert.equal(image.getAttribute("src"), original, "the size boundary upgrades the existing preview instead of re-rendering");
  assert.equal(asset.width, 2048);
  assert.equal(asset.height, 3072);
  assert.equal(asset.url, original);
});

test("DPR changes use the same synchronization path and preserve an original requested before it finishes loading", (t) => {
  const { view, container, mount, window } = setup(t);
  const image = mount();
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
  view.syncImages(container, { scale: 0.41 });
  assert.equal(image.getAttribute("src"), original);
  assert.equal(image.hasAttribute("srcset"), false);
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
  view.syncImages(container, { scale: 0.2 });
  assert.equal(image.getAttribute("src"), original);
  assert.equal(mount().getAttribute("src"), original, "a remount cannot cancel a requested high-resolution source");
});

test("small material shelf previews work without source dimensions", (t) => {
  const { mount } = setup(t);
  const image = mount({ ...asset, width: undefined, height: undefined }, { thumbnail: true });
  assert.equal(image.getAttribute("src"), `${original}?preview=library`);
  assert.equal(image.hasAttribute("srcset"), false);
  assert.equal(image.hasAttribute("sizes"), false);
});

test("loaded originals remain selected after zooming out and after media remount", (t) => {
  const { view, container, mount, fire } = setup(t);
  const before = view.renderImage(asset, { displayWidth: 600 });
  const image = mount();
  fire(image, "load", original);
  view.syncImages(container, { scale: 0.2 });
  assert.equal(image.getAttribute("src"), original);
  assert.equal(image.hasAttribute("srcset"), false);
  assert.equal(image.hasAttribute("sizes"), false);
  assert.equal(view.renderImage(asset, { displayWidth: 600 }), before, "render markup must stay independent of live resource selection");
  assert.equal(mount().getAttribute("src"), original);
});

test("a failed preview falls back once; an original error never restarts the request", (t) => {
  const { view, container, mount, fire } = setup(t);
  const image = mount();
  let sourceWrites = 0;
  const setAttribute = image.setAttribute.bind(image);
  image.setAttribute = (name, value) => {
    if (name === "src") sourceWrites += 1;
    return setAttribute(name, value);
  };
  fire(image, "error", `${original}?preview=canvas`);
  assert.equal(image.getAttribute("src"), original);
  assert.equal(image.hasAttribute("srcset"), false);
  fire(image, "error", original);
  fire(image, "error", original);
  view.syncImages(container, { scale: 0.2 });
  assert.equal(sourceWrites, 1);
  const remounted = mount();
  assert.equal(remounted.getAttribute("src"), original, "failed variants are not retried on the next node render");
});

test("persisted renamed animations use the server's canvas guarantee after codec drops MIME hints", async (t) => {
  const { window, mount, fire } = setup(t);
  window.eval(await readFile(new URL("../src/legacy-canvas/canvas-document-codec.js", import.meta.url), "utf8"));
  const snapshot = window.REELAY_CANVAS_DOCUMENT_CODEC.createSnapshot({
    activeCanvasId: "canvas-1",
    canvases: [{ id: "canvas-1", nodes: [{
      id: "node-1", kind: "asset", activeAssetId: asset.id,
      assets: [{ ...asset, name: "角色动效", displayName: "角色动效", contentType: "image/gif", animated: true }],
    }] }],
  });
  const restored = snapshot.canvases[0].nodes[0].assets[0];
  assert.equal(restored.contentType, undefined);
  assert.equal(restored.animated, undefined);
  const image = mount(restored);
  assert.equal(image.getAttribute("src"), `${original}?preview=canvas`);
  fire(image, "error", `${original}?preview=canvas`);
  assert.equal(image.getAttribute("src"), original);
  assert.equal(restored.url, original);
});

test("detached image callbacks cannot change a replacement node or its resolution preference", (t) => {
  const { mount, fire } = setup(t);
  const oldImage = mount();
  const replacement = mount();
  fire(oldImage, "load", original);
  fire(oldImage, "error", `${original}?preview=canvas`);
  assert.equal(replacement.getAttribute("src"), `${original}?preview=canvas`);
  assert.ok(mount().hasAttribute("srcset"));
});

test("adaptive markup does not replace a retained generator media frame", async (t) => {
  const { view, container, window, fire } = setup(t);
  const promptSource = await readFile(new URL("../src/legacy-canvas/canvas-node-prompt-view.js", import.meta.url), "utf8");
  window.eval(promptSource);
  const renderContents = window.REELAY_CANVAS_NODE_PROMPT_VIEW.renderContents;
  const markup = () => `<section class="media-frame">${view.renderImage(asset, { displayWidth: 600 })}</section><section class="prompt-panel"><textarea data-node-prompt-input></textarea></section>`;
  renderContents(container, markup());
  view.syncImages(container, { scale: 0.41 });
  const image = container.querySelector("img");
  view.syncImages(container, { scale: 1.7 });
  fire(image, "load", original);
  assert.equal(renderContents(container, markup()).retainedMedia, true);
  view.syncImages(container, { scale: 0.2 });
  assert.equal(container.querySelector("img"), image);
  assert.equal(image.getAttribute("src"), original);
});

test("real canvas asset and generator images follow zoom without replacing live media or canonical dimensions", async (t) => {
  const projectRoot = new URL("../", import.meta.url);
  const html = await readFile(new URL("index.html", projectRoot), "utf8");
  const dom = new JSDOM(html, { url: `${origin}/index.html`, runScripts: "outside-only", pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.structuredClone = structuredClone;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  window.setTimeout = () => 1;
  window.clearTimeout = () => {};
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const paths = [...window.document.querySelectorAll("script[src]")]
    .map((script) => script.getAttribute("src"))
    .filter((path) => path.startsWith("./")).map((path) => path.split("?")[0]);
  const scripts = await Promise.all(paths.map(async (path) => ({ path, source: await readFile(new URL(path, projectRoot), "utf8") })));
  for (const script of scripts) window.eval(script.source + (script.path === "./app.js"
    ? "\nwindow.imageTest = { state, canvasRuntimeStore };" : ""));
  const { state, canvasRuntimeStore } = window.imageTest;
  const sourceNode = window.defaultAssetNode(20, 40, { ...asset, name: "portrait.png" });
  const generator = Object.assign(window.defaultGeneratorNode(850, 40, "image"), {
    generatedAsset: { ...asset, id: "generated" }, preview: true, expanded: true,
    assets: [{ ...asset, id: "reference", width: undefined, height: undefined }],
  });
  const canvas = { ...window.createCanvasRecord("Image test"), id: "image-test", nodes: [sourceNode, generator], scale: 0.41 };
  canvasRuntimeStore.replaceCanvases([canvas], canvas.id);
  window.render();
  const frameImages = [...window.document.querySelectorAll(".canvas-node .frame-media")];
  assert.equal(frameImages.length, 2);
  for (const [index, node] of [sourceNode, generator].entries()) {
    assert.equal(frameImages[index].getAttribute("sizes"), `${Math.ceil(window.getNodeLayout(node).mediaWidth * 0.41)}px`);
    assert.match(frameImages[index].getAttribute("srcset"), /341w/);
  }
  const shelfImage = window.document.querySelector(".asset-shelf img");
  assert.equal(shelfImage.getAttribute("src"), `${original}?preview=library`);
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
  window.dispatchEvent(new window.Event("resize"));
  for (const image of frameImages) assert.equal(image.getAttribute("src"), original);
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
  state.scale = 2;
  window.applyTransform();
  for (const [index, node] of [sourceNode, generator].entries()) {
    assert.equal(window.document.querySelector(`[data-id="${node.id}"] .frame-media`), frameImages[index]);
    assert.equal(frameImages[index].getAttribute("src"), original);
    assert.equal(frameImages[index].hasAttribute("srcset"), false);
  }
  const generatorElement = window.document.querySelector(`[data-id="${generator.id}"]`);
  window.createGeneratorNodeElement(generator, generatorElement);
  assert.equal(generatorElement.querySelector(".frame-media"), frameImages[1]);
  assert.equal(sourceNode.assets[0].url, original);
  assert.equal(sourceNode.assets[0].width, 2048);
  assert.equal(sourceNode.assets[0].height, 3072);
  assert.equal(generator.generatedAsset.url, original);
  assert.equal(window.getMediaSpec(sourceNode), "2048 x 3072");
  assert.equal(window.getMediaSpec(generator), "2048 x 3072");
});
