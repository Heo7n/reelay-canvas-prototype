import type { HtmlTagDescriptor, Plugin } from "vite";

export function generationSimulatorTags(pathname: string): HtmlTagDescriptor[] {
  if (pathname !== "/index.html") return [];
  return [
    { tag: "link", attrs: { rel: "stylesheet", href: "/src/dev/generation-simulator.css" }, injectTo: "head" },
    { tag: "script", attrs: { src: "/src/dev/generation-simulator.js", defer: true }, injectTo: "head" },
  ];
}

// Development controls are never referenced by the canvas entry or build graph.
export function generationSimulatorPlugin(): Plugin {
  return {
    name: "reelay-generation-simulator",
    apply: "serve",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const tags = generationSimulatorTags(context.path);
        return tags.length ? { html, tags } : html;
      },
    },
  };
}
