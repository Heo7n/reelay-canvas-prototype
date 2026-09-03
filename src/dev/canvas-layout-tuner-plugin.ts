import type { HtmlTagDescriptor, Plugin } from "vite";

const legacyCanvasPath = "/index.html";

export function canvasLayoutTunerTags(pathname: string): HtmlTagDescriptor[] {
  if (pathname !== legacyCanvasPath) return [];

  return [
    {
      tag: "link",
      attrs: {
        rel: "stylesheet",
        href: "/dev/canvas-layout-tuner.css?v=20260903-layout-tune-1",
      },
      injectTo: "head",
    },
    {
      tag: "script",
      attrs: {
        src: "/dev/canvas-layout-tuner.js?v=20260903-layout-tune-1",
      },
      injectTo: "head",
    },
  ];
}

export function canvasLayoutTunerPlugin(): Plugin {
  return {
    name: "reelay-canvas-layout-tuner",
    apply: "serve",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const tags = canvasLayoutTunerTags(context.path);
        return tags.length > 0 ? { html, tags } : html;
      },
    },
  };
}
