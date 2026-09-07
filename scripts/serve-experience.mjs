import path from "node:path";
import { access } from "node:fs/promises";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

const root = path.resolve("dist/experience");
await access(path.join(root, "experience-release.json"));
const app = Fastify();
await app.register(fastifyStatic, { root });
app.get("/", (_request, reply) => reply.redirect("/app"));
app.setNotFoundHandler((request, reply) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if ((request.method === "GET" || request.method === "HEAD") && /^\/app(?:\/|$)/.test(pathname)) {
    return reply.sendFile("app-shell.html");
  }
  return reply.code(404).send({ error: "not_found" });
});
const url = await app.listen({ port: 5177, host: "127.0.0.1" });
console.log(`Static experience: ${url}/app (no API, refresh resets edits)`);
