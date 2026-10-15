import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrepareCanvasVideoTaskSchema, type CanvasVideoTask } from "../../contracts/canvas-video-generation";
import { buildServer } from "../app";
import { DEMO_PASSWORD, createDemoSeed } from "../demo-fixtures";
import { InMemoryCanvasVideoGenerationStore } from "../infrastructure/InMemoryCanvasVideoGenerationStore";
import { InMemoryCollaborationStore } from "../infrastructure/InMemoryCollaborationStore";
import { InMemoryObjectStore } from "../infrastructure/InMemoryObjectStore";
import { REELAY_PLATFORM_BASE } from "../infrastructure/ReelayPlatformClient";

const projectId = "project-scifi-trailer";
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const json = (data: unknown) => new Response(JSON.stringify({ code: 200, data }), { headers: { "Content-Type": "application/json" } });
const bytes = Uint8Array.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109]);
const videoUrl = `${REELAY_PLATFORM_BASE}/generated/result.mp4`;

describe("durable canvas video routes", () => {
  let app: FastifyInstance; let documents: InMemoryCollaborationStore; let tasks: InMemoryCanvasVideoGenerationStore;
  let objects: InMemoryObjectStore; let cookie: string; let paidCalls: number; let downloadFails: boolean; let projectsExpired: boolean; let expectedActorId: string;
  let generationResponse: () => Promise<Response>;
  let projectPage: (page: number) => unknown; let requestedProjectPages: number[];
  const headers = () => ({ cookie });
  const scoped = (url: string, actorId = expectedActorId) => `${url}${url.includes("?") ? "&" : "?"}expectedActorId=${encodeURIComponent(actorId)}`;
  async function login(account = "creator@reelay.test") {
    const response = await app.inject({ method: "POST", url: "/api/demo/session", payload: { account, password: DEMO_PASSWORD } });
    const value = response.headers["set-cookie"]; return (Array.isArray(value) ? value[0] : value)!.split(";",1)[0];
  }
  async function connect() {
    expect((await app.inject({ method: "POST", url: "/api/real-generation/connection", headers: headers(), payload: { type: "email", target: "fake@test.invalid", password: "fake-password" } })).statusCode).toBe(200);
    expect((await app.inject({ url: scoped("/api/canvas-video-generation/projects"), headers: headers() })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: "/api/canvas-video-generation/binding", headers: headers(), payload: { projectId, platformProjectId: "remote-project", expectedActorId } })).statusCode).toBe(200);
  }
  function input() { return { requestKey: randomUUID(), projectId, canvasDocumentId: "main", canvasRecordId: "canvas-1", nodeId: "node-1", sourceSurface: "canvas" as const, expectedActorId, prompt: "一个平稳移动的海岸镜头。", parameters: { modelId: "seedance-2-fast", resolution: "480P", aspectRatio: "16:9", duration: 5, generateAudio: true, workflow: "omni-reference", generationStage: "standard" }, references: [] }; }
  async function prepare() {
    const request = input(); const response = await app.inject({ method: "POST", url: "/api/canvas-video-generation/tasks/prepare", headers: headers(), payload: request });
    expect(response.statusCode).toBe(201); expect(response.json().id).toBe(request.requestKey); return response.json<CanvasVideoTask>();
  }
  async function bindTask(task: CanvasVideoTask, canvasRecordId = task.canvasRecordId) {
    const previous = await documents.getCanvasDocument({ actorId: "actor-tianmaochao", projectId, canvasId: "main" });
    await documents.saveCanvasDocument({ actorId: "actor-tianmaochao", projectId, canvasId: "main", schemaVersion: 1, expectedRevision: previous?.revision ?? 0, content: { canvases: [{ id: canvasRecordId, nodes: [{ id: task.nodeId, kind: "generator", mediaKind: "video", realGenerationTaskId: task.id }] }] } });
  }
  async function activate(task: CanvasVideoTask) { return app.inject({ method: "POST", url: scoped(`/api/canvas-video-generation/tasks/${task.id}/activate`), headers: headers() }); }
  async function terminal(task: CanvasVideoTask) {
    for (let attempt=0;attempt<100;attempt++) {
      const response=await app.inject({url:scoped(`/api/canvas-video-generation/tasks/${task.id}`),headers:headers()}); const value=response.json<CanvasVideoTask>();
      if (!["submitting","waiting","saving"].includes(value.status)) return value;
      await new Promise((resolve)=>setTimeout(resolve,2));
    }
    throw new Error("Task did not finish");
  }
  beforeEach(async () => {
    vi.stubEnv("NODE_ENV","test"); vi.stubEnv("VERCEL","");
    paidCalls=0; downloadFails=false; projectsExpired=false; expectedActorId="actor-tianmaochao"; documents=new InMemoryCollaborationStore(); tasks=new InMemoryCanvasVideoGenerationStore(documents); objects=new InMemoryObjectStore();
    requestedProjectPages=[];projectPage=()=>({items:[{id:"remote-project",name:"官网项目"}],total:1});
    generationResponse=async()=>new Response(frame({type:"artifact_status",content:{artifacts:[{id:"artifact-created",type:"video",status:3,asset_id:"asset-output"}]}})+frame({type:"asset_status",content:{assets:[{id:"asset-output",type:"video",status:3,file_url:videoUrl}]}})+"data: [DONE]\n\n",{headers:{"Content-Type":"text/event-stream"}});
    const fetcher: typeof fetch = async (request,init) => {
      const url=String(request);
      if (url.endsWith("/auth/login")) return json({token:"fake-secret",user:{id:"platform-user",nickname:"测试平台账号"}});
      if (url.includes("/api/v1/projects?")) { const page=Number(new URL(url).searchParams.get("page"));requestedProjectPages.push(page);return projectsExpired ? new Response("expired", {status:401}) : json(projectPage(page)); }
      if (url.endsWith("/api/v1/assets")&&init?.method==="POST") return json({id:"placeholder-video",type:"video",project_id:"remote-project"});
      if (url.endsWith("/api/v1/artifacts")&&init?.method==="POST") return json({id:"artifact-created",type:"video",project_id:"remote-project",asset_id:"placeholder-video"});
      if (url.endsWith("/artifacts/generate-stream")) { paidCalls++; return generationResponse(); }
      if (url===videoUrl || url.startsWith(`${REELAY_PLATFORM_BASE}/proxy-image?`)) { if(downloadFails) throw new Error("fake save failure"); return new Response(bytes,{headers:{"Content-Type":"video/mp4"}}); }
      throw new Error("Unexpected fake request");
    };
    app=await buildServer({store:documents,canvasVideoStore:tasks,objectStore:objects,realGeneration:{enabled:true,fetcher}}); cookie=await login();
  });
  afterEach(async () => { await app.close(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("returns explicit simulation only for disconnected, and rejects remote/cross-site access", async()=>{
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/context?projectId=${projectId}`),headers:headers()})).json()).toEqual({kind:"simulation",reason:"disconnected",taskHistoryAvailable:true});
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/context?projectId=${projectId}`)})).statusCode).toBe(401);
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/context?projectId=${projectId}`),headers:{...headers(),host:"remote.invalid"}})).statusCode).toBe(403);
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/context?projectId=${projectId}`),headers:{...headers(),origin:"https://remote.invalid"}})).statusCode).toBe(403);
  });
  it("declares task history unavailable when this server has no task store",async()=>{
    await app.close();app=await buildServer({store:new InMemoryCollaborationStore()});cookie=await login();
    const context=await app.inject({url:scoped(`/api/canvas-video-generation/context?projectId=${projectId}`),headers:headers()});
    expect(context.statusCode).toBe(200);expect(context.json()).toEqual({kind:"simulation",reason:"unavailable",taskHistoryAvailable:false});
  });
  it("uses a persisted page-two binding after reconnecting without asking the UI to list that page again",async()=>{
    projectPage=(page)=>page===1?{items:[{id:"other-project",name:"其他项目"}],has_more:true}:{items:[{id:"remote-project",name:"官网第二页项目"}],has_more:false};
    await connect();const task=await prepare();await bindTask(task);
    expect((await app.inject({method:"POST",url:"/api/real-generation/connection",headers:headers(),payload:{type:"email",target:"fake@test.invalid",password:"fake-password"}})).statusCode).toBe(200);
    const context=await app.inject({url:scoped(`/api/canvas-video-generation/context?projectId=${projectId}`),headers:headers()});
    expect(context.json()).toMatchObject({kind:"real",binding:{projectId,platformProjectId:"remote-project"},taskHistoryAvailable:true});
    requestedProjectPages=[];expect((await activate(task)).statusCode).toBe(202);expect(requestedProjectPages).toEqual([1,2]);expect((await terminal(task)).status).toBe("succeeded");expect(paidCalls).toBe(1);
  });
  it("requires the trusted actor precondition on every personal boundary",async()=>{
    const payload:Partial<ReturnType<typeof input>>={...input()};delete payload.expectedActorId;
    const id=randomUUID();
    const responses=await Promise.all([
      app.inject({url:`/api/canvas-video-generation/context?projectId=${projectId}`,headers:headers()}),
      app.inject({url:"/api/canvas-video-generation/projects?page=1",headers:headers()}),
      app.inject({url:`/api/canvas-video-generation/tasks?projectId=${projectId}`,headers:headers()}),
      app.inject({url:`/api/canvas-video-generation/tasks/${id}`,headers:headers()}),
      app.inject({url:`/api/canvas-video-generation/tasks/${id}/projection?projectId=${projectId}`,headers:headers()}),
      app.inject({method:"POST",url:`/api/canvas-video-generation/tasks/${id}/activate`,headers:headers()}),
      app.inject({method:"POST",url:`/api/canvas-video-generation/tasks/${id}/retry-save`,headers:headers()}),
      app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers:headers(),payload}),
      app.inject({method:"PUT",url:"/api/canvas-video-generation/binding",headers:headers(),payload:{projectId,platformProjectId:"remote-project"}}),
    ]);
    for(const response of responses) {expect(response.statusCode).toBe(400);expect(response.json().error.code).toBe("invalid_request");}
    expect(PrepareCanvasVideoTaskSchema.safeParse(payload).success).toBe(false);expect(paidCalls).toBe(0);
  });
  it("rejects cookie actor drift before reading B private records or saving A private input under B",async()=>{
    await connect();const actorATask=await prepare();const actorA=expectedActorId;
    cookie=await login("linjing@reelay.test");expectedActorId="actor-linjing";await connect();
    const actorBTask=await prepare();expectedActorId=actorA;
    const privatePrompt="仅属于原账号 A 的私人提示词";
    const responses=await Promise.all([
      app.inject({url:scoped(`/api/canvas-video-generation/context?projectId=${projectId}`),headers:headers()}),
      app.inject({url:scoped("/api/canvas-video-generation/projects?page=1"),headers:headers()}),
      app.inject({url:scoped(`/api/canvas-video-generation/tasks?projectId=${projectId}`),headers:headers()}),
      app.inject({url:scoped(`/api/canvas-video-generation/tasks/${actorBTask.id}`),headers:headers()}),
      app.inject({url:scoped(`/api/canvas-video-generation/tasks/${actorATask.id}/projection?projectId=${projectId}`),headers:headers()}),
      app.inject({method:"POST",url:scoped(`/api/canvas-video-generation/tasks/${actorATask.id}/activate`),headers:headers()}),
      app.inject({method:"POST",url:scoped(`/api/canvas-video-generation/tasks/${actorATask.id}/retry-save`),headers:headers()}),
      app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers:headers(),payload:{...input(),prompt:privatePrompt}}),
      app.inject({method:"PUT",url:"/api/canvas-video-generation/binding",headers:headers(),payload:{projectId,platformProjectId:"remote-project",expectedActorId:actorA}}),
    ]);
    for(const response of responses) {
      expect(response.statusCode).toBe(401);expect(response.json()).toEqual({error:{code:"session_actor_changed",message:"登录账号已变化，请使用原账号恢复当前画布。"}});
      expect(response.body).not.toContain(privatePrompt);expect(response.body).not.toContain(actorBTask.prompt);
    }
    const actorBRecords=await tasks.list("actor-linjing",projectId);expect(actorBRecords).toHaveLength(1);expect(actorBRecords[0].task.id).toBe(actorBTask.id);expect(paidCalls).toBe(0);
    expect((await app.inject({url:scoped("/api/canvas-video-generation/projects?page=1","actor-linjing"),headers:headers()})).statusCode).toBe(200);
  });
  it("blocks expired platform connections without creating a task or falling back to simulation",async()=>{
    await connect(); projectsExpired=true;
    const response=await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers:headers(),payload:input()}); expect(response.statusCode).toBe(401);
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/context?projectId=${projectId}`),headers:headers()})).json()).toEqual({kind:"blocked",reason:"expired",taskHistoryAvailable:true});
    expect((await tasks.list("actor-tianmaochao",projectId))).toEqual([]); expect(paidCalls).toBe(0);
  });
  it("freezes parameters and performs no upstream generation before the saved matching internal node reference", async()=>{
    await connect(); const task=await prepare(); expect(paidCalls).toBe(0);
    expect((await activate(task)).json().error.code).toBe("task_not_bound");
    await bindTask(task,"another-internal-canvas"); expect((await activate(task)).json().error.code).toBe("task_not_bound"); expect(paidCalls).toBe(0);
    await bindTask(task); expect((await activate(task)).statusCode).toBe(202);
    const result=await terminal(task); expect(result.status).toBe("succeeded"); expect(paidCalls).toBe(1);
    expect((await tasks.get("actor-tianmaochao",task.id))?.artifact).toEqual({assetId:"placeholder-video",artifactId:"artifact-created"});
    expect((await tasks.get("actor-tianmaochao",task.id))?.input).not.toHaveProperty("expectedActorId");
    expect(JSON.stringify(result)).not.toContain("fake-secret");
    await activate(task); expect(paidCalls).toBe(1);
  });
  it("uses actor request idempotency, rejects conflicting input, and validates unsupported references", async()=>{
    await connect(); const payload=input();
    const first=await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers:headers(),payload});
    const again=await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers:headers(),payload});
    expect(again.json().id).toBe(first.json().id);
    const explicitNull=await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers:headers(),payload:{...payload,conversationId:null}});expect(explicitNull.statusCode).toBe(201);expect(explicitNull.json().id).toBe(first.json().id);
    expect(PrepareCanvasVideoTaskSchema.parse(payload).conversationId).toBeNull();expect((await tasks.get("actor-tianmaochao",first.json().id))?.input).toHaveProperty("conversationId",null);
    const conflict=await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers:headers(),payload:{...payload,prompt:"different"}}); expect(conflict.statusCode).toBe(409);
    expect(PrepareCanvasVideoTaskSchema.safeParse({...payload,references:[{url:"https://example.invalid/image.png"}]}).success).toBe(false);
    expect(PrepareCanvasVideoTaskSchema.safeParse({...payload,conversationId:randomUUID()}).success).toBe(false); expect(paidCalls).toBe(0);
  });
  it("activates a private conversation through its saved video asset node and keeps the conversation identity out of projection",async()=>{
    await connect();const payload={...input(),sourceSurface:"conversation",conversationId:randomUUID()};
    const prepared=await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers:headers(),payload});expect(prepared.statusCode).toBe(201);const task=prepared.json<CanvasVideoTask>();
    await documents.saveCanvasDocument({actorId:"actor-tianmaochao",projectId,canvasId:"main",schemaVersion:1,expectedRevision:0,content:{canvases:[{id:task.canvasRecordId,nodes:[{id:task.nodeId,kind:"asset",mode:"video",assets:[],realGenerationTaskId:task.id}]}]}});
    expect((await activate(task)).statusCode).toBe(202);expect((await terminal(task)).status).toBe("succeeded");expect(paidCalls).toBe(1);
    const projection=await app.inject({url:scoped(`/api/canvas-video-generation/tasks/${task.id}/projection?projectId=${projectId}`),headers:headers()});expect(projection.json()).not.toHaveProperty("conversationId");expect(projection.json()).not.toHaveProperty("prompt");
  });
  it("preserves terminal success when its database acknowledgement is lost",async()=>{
    await connect();const update=tasks.update.bind(tasks);vi.spyOn(tasks,"update").mockImplementation(async(record)=>{await update(record);if(record.task.status==="succeeded")throw new Error("Lost commit acknowledgement");});
    const task=await prepare();await bindTask(task);await activate(task);const done=await terminal(task);expect(done.status).toBe("succeeded");expect(paidCalls).toBe(1);expect((await app.inject({url:done.result!.url,headers:headers()})).statusCode).toBe(200);
  });
  it("keeps private task input actor-owned while current project members read only projection and result Range", async()=>{
    await connect(); const task=await prepare(); await bindTask(task); await activate(task); const done=await terminal(task);
    const other=await login("linjing@reelay.test");
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/tasks/${task.id}`,"actor-linjing"),headers:{cookie:other}})).statusCode).toBe(404);
    const projection=await app.inject({url:scoped(`/api/canvas-video-generation/tasks/${task.id}/projection?projectId=${projectId}`,"actor-linjing"),headers:{cookie:other}});
    expect(projection.statusCode).toBe(200); expect(projection.json().isOwner).toBe(false); expect(projection.json()).not.toHaveProperty("prompt"); expect(projection.json()).not.toHaveProperty("conversationId");
    const range=await app.inject({url:done.result!.url,headers:{cookie:other,range:"bytes=0-7"}}); expect(range.statusCode).toBe(206); expect(range.rawPayload).toHaveLength(8);
    const viewer=await login("zhouyu@reelay.test");
    expect((await app.inject({url:done.result!.url,headers:{cookie:viewer}})).statusCode).toBe(200);
    const viewerPrepare=await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers:{cookie:viewer},payload:{...input(),expectedActorId:"actor-zhouyu"}}); expect(viewerPrepare.statusCode).toBe(403);
    const nonmember=await login("liran@reelay.test");
    expect((await app.inject({url:done.result!.url,headers:{cookie:nonmember}})).statusCode).toBe(404);
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/tasks/${task.id}/projection?projectId=${projectId}`,"actor-liran"),headers:{cookie:nonmember}})).statusCode).toBe(404);
    expect((await app.inject({url:done.result!.url,headers:{cookie:other,range:"bytes=100-"}})).statusCode).toBe(416);
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/tasks/${task.id}?projectId=wrong`),headers:headers()})).statusCode).toBe(404);
  });
  it("retries only saving after a confirmed output and survives service recreation without a connection",async()=>{
    await connect(); downloadFails=true; const task=await prepare(); await bindTask(task); await activate(task); expect((await terminal(task)).status).toBe("save_failed"); expect(paidCalls).toBe(1);
    downloadFails=false; const retried=await app.inject({method:"POST",url:scoped(`/api/canvas-video-generation/tasks/${task.id}/retry-save`),headers:headers()}); expect(retried.statusCode).toBe(202); const done=await terminal(task); expect(done.status).toBe("succeeded"); expect(paidCalls).toBe(1);
    await app.close(); documents=new InMemoryCollaborationStore(createDemoSeed()); app=await buildServer({store:documents,canvasVideoStore:tasks,objectStore:objects}); cookie=await login();
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/context?projectId=${projectId}`),headers:headers()})).json()).toEqual({kind:"simulation",reason:"unavailable",taskHistoryAvailable:true});
    expect((await app.inject({url:scoped(`/api/canvas-video-generation/tasks/${task.id}`),headers:headers()})).json().status).toBe("succeeded");
    expect((await app.inject({url:done.result!.url,headers:headers()})).statusCode).toBe(200);
  });
  it("fences an unconfirmed account across probe and new canvas requests without automatically retrying",async()=>{
    await connect(); generationResponse=async()=>new Response("data: [DONE]\n\n",{headers:{"Content-Type":"text/event-stream"}});
    const task=await prepare(); await bindTask(task); await activate(task); expect((await terminal(task)).status).toBe("unconfirmed");
    const second=await prepare(); await bindTask(second); expect((await activate(second)).statusCode).toBe(409);
    const probe=await app.inject({method:"POST",url:"/api/real-generation/probes",headers:headers(),payload:{requestKey:randomUUID(),projectId:"remote-project",prompt:"不能重发",paidConsent:true}}); expect(probe.statusCode).toBe(409);
    expect(paidCalls).toBe(1);
  });
  it("restores an already-saved legacy probe using only verified local metadata",async()=>{
    const id=randomUUID(); const stored=await objects.putObject({objectKey:`real-generation-probes/${id}/video.mp4`,contentType:"video/mp4",body:bytes});
    const now=new Date().toISOString();
    await app.close(); documents=new InMemoryCollaborationStore();
    app=await buildServer({store:documents,objectStore:objects,realGeneration:{enabled:true,fetcher:async()=>{throw new Error("Restored result must not call platform");}},savedGenerationProbes:[{actorId:"actor-tianmaochao",platformUserId:"platform-user",stored,probe:{id,requestKey:randomUUID(),projectId:"remote-project",status:"succeeded",createdAt:now,finishedAt:now,prompt:"先前成功的首测",message:"saved",diagnostics:{eventCount:0,eventTypes:[],eventShapes:[]},result:{url:`/api/real-generation/probes/${id}/video`,contentType:"video/mp4",byteSize:bytes.byteLength}}}]}); cookie=await login();
    expect((await app.inject({url:`/api/real-generation/probes/${id}`,headers:headers()})).json().status).toBe("succeeded");
    expect((await app.inject({url:`/api/real-generation/probes/${id}/video`,headers:{...headers(),range:"bytes=0-7"}})).statusCode).toBe(206);
    const other=await login("linjing@reelay.test");expect((await app.inject({url:`/api/real-generation/probes/${id}/video`,headers:{cookie:other}})).statusCode).toBe(404);
  });
});
