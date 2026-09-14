import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const layers = ["src/domain", "src/application", "src/server/application"];
const within = (file, directory) => file === directory || file.startsWith(`${directory}/`);
const relativePath = (filename) => path.relative(projectRoot, filename).split(path.sep).join("/");

const layerImports = {
  meta: {
    type: "problem",
    docs: { description: "Keep domain and application imports independent of UI and I/O implementations." },
    schema: [],
    messages: {
      forbidden: "{{layer}} cannot import '{{source}}'. Depend on domain types or an application port; wire UI/I/O in an adapter or composition root.",
      dynamic: "Core-layer imports must use a literal path so their dependency boundary can be checked.",
    },
  },
  create(context) {
    const filename = context.filename;
    const owner = layers.find((layer) => within(relativePath(filename), layer));
    if (!owner) return {};
    const allowed = owner === "src/domain" ? [owner] : ["src/domain", "src/application", owner];

    function check(node, source) {
      if (!source || typeof source.value !== "string") {
        context.report({ node, messageId: "dynamic" });
        return;
      }
      const specifier = source.value;
      // Pure validation is the only currently approved external dependency in
      // these layers. New packages require an explicit architecture decision.
      if (specifier === "zod" || specifier.startsWith("zod/")) return;
      if (specifier.startsWith(".")) {
        const target = relativePath(path.resolve(path.dirname(filename), specifier));
        if (allowed.some((layer) => within(target, layer))) return;
      }
      context.report({ node: source, messageId: "forbidden", data: { layer: owner, source: specifier } });
    }

    return {
      ImportDeclaration(node) { check(node, node.source); },
      ExportNamedDeclaration(node) { if (node.source) check(node, node.source); },
      ExportAllDeclaration(node) { check(node, node.source); },
      ImportExpression(node) { check(node, node.source); },
      TSImportType(node) { check(node, node.argument); },
      TSExternalModuleReference(node) { check(node, node.expression); },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") check(node, node.arguments[0]);
      },
    };
  },
};

export default { rules: { "layer-imports": layerImports } };
