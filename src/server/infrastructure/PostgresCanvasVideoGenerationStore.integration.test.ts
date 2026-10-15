import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrepareCanvasVideoTaskInputSchema } from "../../contracts/canvas-video-generation";
import type { CanvasVideoTask } from "../../domain/generation/canvas-video-task";
import { buildServer } from "../app";
import type { CanvasVideoTaskRecord } from "../application/CanvasVideoGenerationStore";
import { DEFAULT_LOCAL_DATABASE_URL } from "../db/config";
import { runMigrations } from "../db/migrate";
import { seedDemoDatabase } from "../db/seed";
import { DEMO_PASSWORD } from "../demo-fixtures";
import { InMemoryObjectStore } from "./InMemoryObjectStore";
import { REELAY_PLATFORM_BASE } from "./ReelayPlatformClient";
import { PostgresCanvasVideoGenerationStore } from "./PostgresCanvasVideoGenerationStore";
import { PostgresCollaborationStore } from "./PostgresCollaborationStore";

const databaseName = `reelay_canvas_video_test_${process.pid}_${randomBytes(4).toString("hex")}`;
const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_LOCAL_DATABASE_URL);
adminUrl.pathname = "/postgres"; adminUrl.search = "";
const testUrl = new URL(adminUrl); testUrl.pathname = `/${databaseName}`;
let admin: Pool; let pool: Pool; let applied: string[]; let created = false;
const createPool = () => new Pool({ connectionString: testUrl.toString(), max: 4, application_name: "reelay-canvas-video-isolated-test" });
const projectId = "project-scifi-trailer";
function record(actorId = "actor-tianmaochao"): CanvasVideoTaskRecord {
  const id = randomUUID(); const now = new Date().toISOString();
  const input = PrepareCanvasVideoTaskInputSchema.parse({ requestKey:id,projectId,canvasDocumentId:"main",canvasRecordId:"canvas-1",nodeId:`node-${id}`,sourceSurface:"canvas",prompt:"测试，不发出真实请求。",references:[],parameters:{modelId:"seedance-2-fast",resolution:"480P",aspectRatio:"16:9",duration:5,generateAudio:true,workflow:"omni-reference",generationStage:"standard"} });
  return { task:{...input,id,conversationId:null,status:"prepared",createdAt:now,updatedAt:now,message:"prepared",result:null},input,actorId,platformUserId:"fake-platform-user",connectionId:randomUUID(),platformProjectId:"fake-platform-project",attemptId:null,ownerProcessId:null,video:null,object:null,artifact:null };
}
async function bind(records: CanvasVideoTaskRecord[], canvasRecordId = "canvas-1") {
  const documents=new PostgresCollaborationStore(pool); const previous=await documents.getCanvasDocument({actorId:"actor-tianmaochao",projectId,canvasId:"main"});
  await documents.saveCanvasDocument({actorId:"actor-tianmaochao",projectId,canvasId:"main",schemaVersion:1,expectedRevision:previous?.revision??0,content:{canvases:[{id:canvasRecordId,nodes:records.map((entry)=>({id:entry.task.nodeId,kind:"generator",mediaKind:"video",realGenerationTaskId:entry.task.id}))}]}});
}
beforeAll(async()=>{
  if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error("Unsafe isolated database name");
  admin=new Pool({connectionString:adminUrl.toString(),max:1,application_name:"reelay-canvas-video-test-admin"});
  await admin.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$`);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created=true;
  pool=createPool(); applied=await runMigrations(pool); await seedDemoDatabase(pool);
});
beforeEach(async()=>{ await pool.query("TRUNCATE canvas_video_tasks,canvas_video_project_bindings,real_generation_account_locks"); });
afterAll(async()=>{
  await pool?.end();
  if (admin) { if (created) await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`); await admin.end(); }
});

describe("PostgreSQL canvas video persistence in a new isolated database",()=>{
  it("freezes omitted conversation identity consistently through HTTP prepare, save, activate and result reads",async()=>{
    vi.stubEnv("NODE_ENV","test");vi.stubEnv("VERCEL","");
    const httpPool=createPool();const documents=new PostgresCollaborationStore(httpPool);const tasks=new PostgresCanvasVideoGenerationStore(httpPool);
    const objects=new InMemoryObjectStore();const requestKey=randomUUID();const actorId="actor-tianmaochao";
    const videoUrl=`${REELAY_PLATFORM_BASE}/generated/http-joint-test.mp4`;const videoBytes=Uint8Array.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109]);
    const json=(data:unknown)=>new Response(JSON.stringify({code:200,data}),{headers:{"Content-Type":"application/json"}});
    const frame=(value:unknown)=>`data: ${JSON.stringify(value)}\n\n`;let paidCalls=0;
    const fetcher:typeof fetch=async(request,init)=>{
      const url=String(request);
      if(url.endsWith("/auth/login"))return json({token:"fake-joint-test-token",user:{id:"fake-platform-user",nickname:"隔离测试账号"}});
      if(url.includes("/api/v1/projects?"))return json({items:[{id:"fake-platform-project",name:"隔离官网项目"}],total:1});
      if(url.endsWith("/api/v1/assets")&&init?.method==="POST")return json({id:"http-placeholder",type:"video",project_id:"fake-platform-project"});
      if(url.endsWith("/api/v1/artifacts")&&init?.method==="POST")return json({id:"http-artifact",type:"video",project_id:"fake-platform-project",asset_id:"http-placeholder"});
      if(url.endsWith("/artifacts/generate-stream")){
        paidCalls++;const attempted=await tasks.get(actorId,requestKey);expect(attempted?.attemptId).not.toBeNull();
        return new Response(frame({type:"artifact_status",content:{artifacts:[{id:"http-artifact",type:"video",status:3,asset_id:"http-output"}]}})+frame({type:"asset_status",content:{assets:[{id:"http-output",type:"video",status:3,file_url:videoUrl}]}})+"data: [DONE]\n\n",{headers:{"Content-Type":"text/event-stream"}});
      }
      if(url===videoUrl||url.startsWith(`${REELAY_PLATFORM_BASE}/proxy-image?`))return new Response(videoBytes,{headers:{"Content-Type":"video/mp4"}});
      throw new Error("Unexpected fake platform operation");
    };
    const app=await buildServer({store:documents,canvasVideoStore:tasks,objectStore:objects,realGeneration:{enabled:true,fetcher}});
    try {
      const login=await app.inject({method:"POST",url:"/api/demo/session",payload:{account:"creator@reelay.test",password:DEMO_PASSWORD}});
      expect(login.statusCode).toBe(201);const setCookie=login.headers["set-cookie"];const localCookie=(Array.isArray(setCookie)?setCookie[0]:setCookie)!.split(";",1)[0];const headers={cookie:localCookie};
      expect((await app.inject({method:"POST",url:"/api/real-generation/connection",headers,payload:{type:"email",target:"fake@example.invalid",password:"fixture-only"}})).statusCode).toBe(200);
      expect((await app.inject({url:`/api/canvas-video-generation/projects?expectedActorId=${actorId}`,headers})).statusCode).toBe(200);
      expect((await app.inject({method:"PUT",url:"/api/canvas-video-generation/binding",headers,payload:{projectId,platformProjectId:"fake-platform-project",expectedActorId:actorId}})).statusCode).toBe(200);
      const payload={requestKey,expectedActorId:actorId,projectId,canvasDocumentId:"http-main",canvasRecordId:"http-inner",nodeId:"http-node",sourceSurface:"canvas",prompt:"隔离测试：海岸镜头",references:[],parameters:{modelId:"seedance-2-fast",resolution:"480P",aspectRatio:"16:9",duration:4,generateAudio:false,workflow:"omni-reference",generationStage:"standard"}};
      const prepared=await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers,payload});
      expect(prepared.statusCode).toBe(201);expect(prepared.json<CanvasVideoTask>().conversationId).toBeNull();
      expect((await tasks.get(actorId,requestKey))?.input).toHaveProperty("conversationId",null);expect(paidCalls).toBe(0);
      expect((await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers,payload})).statusCode).toBe(201);
      expect((await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers,payload:{...payload,conversationId:null}})).statusCode).toBe(201);
      expect((await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers,payload:{...payload,prompt:"另一条内容"}})).statusCode).toBe(409);
      expect((await app.inject({method:"POST",url:"/api/canvas-video-generation/tasks/prepare",headers,payload:{...payload,parameters:{...payload.parameters,duration:5}}})).statusCode).toBe(409);expect(paidCalls).toBe(0);
      const saved=await app.inject({method:"PUT",url:`/api/projects/${projectId}/canvases/http-main/document`,headers,payload:{schemaVersion:1,expectedRevision:0,expectedActorId:actorId,content:{kind:"reelay-legacy-canvas",version:1,activeCanvasId:"http-inner",canvases:[{id:"http-inner",name:"联合验收",nodes:[{id:"http-node",kind:"generator",mediaKind:"video",realGenerationTaskId:requestKey}]}]}}});
      expect(saved.statusCode).toBe(201);expect(saved.json().document.content.canvases[0].nodes[0].realGenerationTaskId).toBe(requestKey);
      const activated=await app.inject({method:"POST",url:`/api/canvas-video-generation/tasks/${requestKey}/activate?projectId=${projectId}&canvasDocumentId=http-main&expectedActorId=${actorId}`,headers});expect(activated.statusCode).toBe(202);
      let completed:CanvasVideoTask|undefined;
      for(let index=0;index<100;index++){
        const response=await app.inject({url:`/api/canvas-video-generation/tasks/${requestKey}?expectedActorId=${actorId}`,headers});expect(response.statusCode).toBe(200);const task=response.json<CanvasVideoTask>();
        if(task.status==="succeeded"){completed=task;break;}await new Promise((resolve)=>setTimeout(resolve,2));
      }
      expect(completed?.status).toBe("succeeded");expect(paidCalls).toBe(1);const range=await app.inject({url:completed!.result!.url,headers:{...headers,range:"bytes=0-7"}});expect(range.statusCode).toBe(206);expect(range.rawPayload).toHaveLength(8);
    } finally {await app.close();vi.unstubAllEnvs();}
  });
  it("applies 0020 once and enforces server-only tables",async()=>{
    expect(applied).toContain("0020_canvas_video_generation.sql"); expect(await runMigrations(pool)).toEqual([]);
    const tables=["canvas_video_tasks","canvas_video_project_bindings","real_generation_account_locks"];
    const rows=await pool.query<{relrowsecurity:boolean}>("SELECT relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])",[tables]);
    expect(rows.rows).toHaveLength(3); expect(rows.rows.every((row)=>row.relrowsecurity)).toBe(true);
    const grants=await pool.query("SELECT table_name FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated','PUBLIC') AND table_name=ANY($1::text[])",[tables]); expect(grants.rows).toEqual([]);
  });
  it("persists connection-scoped bindings and immutable idempotent task intent across new pools",async()=>{
    const store=new PostgresCanvasVideoGenerationStore(pool); const value=record();
    const binding={projectId,platformProjectId:"remote-project",platformProjectName:"remote name"};
    await store.setBinding(value.actorId,value.platformUserId,value.connectionId,binding); await store.prepare(value);
    await pool.end(); pool=createPool(); const restarted=new PostgresCanvasVideoGenerationStore(pool);
    expect(await restarted.getBinding(value.actorId,value.platformUserId,projectId)).toEqual(binding);
    expect(await restarted.getBinding(value.actorId,"other-real-user",projectId)).toBeNull();
    expect((await restarted.get(value.actorId,value.task.id))?.task.parameters).toEqual(value.task.parameters);
    expect((await restarted.prepare(value)).task.id).toBe(value.task.id);
    await expect(restarted.prepare({...value,input:{...value.input,prompt:"different"}})).rejects.toMatchObject({code:"request_conflict"});
    await expect(restarted.prepare({...value,actorId:"actor-linjing"})).rejects.toMatchObject({code:"request_conflict"});
    expect(await restarted.get("actor-linjing",value.task.id)).toBeNull();
  });
  it("normalizes legacy prepared input with an omitted conversation field without weakening frozen input conflicts",async()=>{
    const store=new PostgresCanvasVideoGenerationStore(pool);const value=record();await store.prepare(value);
    await pool.query("UPDATE canvas_video_tasks SET record=jsonb_set(record,'{input}',(record->'input')-'conversationId') WHERE id=$1",[value.task.id]);
    const replay=await store.prepare({...value,input:{...value.input,conversationId:null}});expect(replay.task.id).toBe(value.task.id);expect(replay.input).toHaveProperty("conversationId",null);
    await expect(store.prepare({...value,input:{...value.input,prompt:"different frozen prompt"}})).rejects.toMatchObject({code:"request_conflict"});
    await expect(store.prepare({...value,input:{...value.input,parameters:{...value.input.parameters,duration:6}}})).rejects.toMatchObject({code:"request_conflict"});
  });
  it("rejects a missing or wrong internal canvas reference before recording a paid attempt",async()=>{
    const store=new PostgresCanvasVideoGenerationStore(pool);const value=record();await store.prepare(value);
    await expect(store.activate(value.actorId,value.task.id,randomUUID(),randomUUID())).rejects.toMatchObject({code:"task_not_bound"});
    await bind([value],"wrong-internal-canvas");await expect(store.activate(value.actorId,value.task.id,randomUUID(),randomUUID())).rejects.toMatchObject({code:"task_not_bound"});
    const saved=await store.get(value.actorId,value.task.id); expect(saved?.attemptId).toBeNull();
    expect((await pool.query("SELECT * FROM real_generation_account_locks")).rowCount).toBe(0);
  });
  it("atomically persists the attempt and admits exactly one account task across independent pools",async()=>{
    const first=record();const second=record();const one=new PostgresCanvasVideoGenerationStore(pool);await one.prepare(first);await one.prepare(second);await bind([first,second]);
    const otherPool=createPool();const two=new PostgresCanvasVideoGenerationStore(otherPool);
    try {
      const outcomes=await Promise.allSettled([one.activate(first.actorId,first.task.id,randomUUID(),randomUUID()),two.activate(second.actorId,second.task.id,randomUUID(),randomUUID())]);
      expect(outcomes.filter((outcome)=>outcome.status==="fulfilled")).toHaveLength(1);expect(outcomes.filter((outcome)=>outcome.status==="rejected")).toHaveLength(1);
      const accepted=outcomes.find((outcome)=>outcome.status==="fulfilled");if(accepted?.status!=="fulfilled")throw new Error("No accepted task");
      expect(accepted.value.attemptId).not.toBeNull(); expect(accepted.value.task.status).toBe("submitting");
      const duplicate=await two.activate(accepted.value.actorId,accepted.value.task.id,randomUUID(),randomUUID());expect(duplicate.attemptId).toBe(accepted.value.attemptId);
      expect(await two.claim(first.platformUserId,randomUUID())).toBe(false);
    } finally {await otherPool.end();}
  });
  it("preserves unknown attempt fences after crash evidence and permits only save retry for known videos",async()=>{
    const store=new PostgresCanvasVideoGenerationStore(pool);const value=record();await store.prepare(value);await bind([value]);const active=await store.activate(value.actorId,value.task.id,randomUUID(),randomUUID());
    await pool.query("UPDATE real_generation_account_locks SET heartbeat_at=now()-interval '2 minutes'"); await store.recoverInterrupted();
    expect((await store.get(value.actorId,value.task.id))?.task.status).toBe("unconfirmed"); expect(await store.claim(value.platformUserId,randomUUID())).toBe(false);
    await expect(store.beginSaveRetry(value.actorId,value.task.id,randomUUID())).rejects.toMatchObject({code:"retry_unavailable"});
    await expect(store.update({...active,task:{...active.task,status:"succeeded"}})).rejects.toMatchObject({code:"request_conflict"});
    await store.release(value.platformUserId,value.task.id);
    const known=record();await store.prepare(known);await bind([known]);const saving=await store.activate(known.actorId,known.task.id,randomUUID(),randomUUID());saving.video={assetId:"known-asset",artifactId:"known-artifact",url:"https://fake.invalid/video.mp4"};saving.task.status="saving";await store.update(saving);
    await pool.query("UPDATE real_generation_account_locks SET heartbeat_at=now()-interval '2 minutes'");await store.recoverInterrupted();
    expect((await store.get(known.actorId,known.task.id))?.task.status).toBe("save_failed");expect((await store.beginSaveRetry(known.actorId,known.task.id,randomUUID())).video).toEqual(saving.video);
  });
  it("keeps completed result metadata durable and separate from private task input",async()=>{
    const store=new PostgresCanvasVideoGenerationStore(pool);const value=record();await store.prepare(value);await bind([value]);const done=await store.activate(value.actorId,value.task.id,randomUUID(),randomUUID());
    done.task.status="succeeded";done.object={objectKey:`canvas-video-results/${value.task.id}/video.mp4`,contentType:"video/mp4",byteSize:20,checksumSha256:"a".repeat(64),etag:"test"};done.task.result={id:value.task.id,taskId:value.task.id,projectId,url:`/api/projects/${projectId}/generation-results/${value.task.id}/video`,contentType:"video/mp4",byteSize:20};await store.update(done);
    expect((await pool.query("SELECT * FROM real_generation_account_locks")).rowCount).toBe(0);
    await pool.end();pool=createPool();const restarted=new PostgresCanvasVideoGenerationStore(pool);expect((await restarted.getResult(projectId,value.task.id))?.object?.objectKey).toBe(done.object.objectKey);
    expect(await restarted.getResult("another-project",value.task.id)).toBeNull();
  });
  it("rechecks current edit permission inside activation transaction",async()=>{
    const store=new PostgresCanvasVideoGenerationStore(pool);const value=record("actor-zhouyu");await store.prepare(value);await bind([value]);
    await expect(store.activate(value.actorId,value.task.id,randomUUID(),randomUUID())).rejects.toMatchObject({code:"project_forbidden"});
    await pool.query("DELETE FROM project_memberships WHERE project_id=$1 AND user_id='actor-linjing'",[projectId]);
    const removed=record("actor-linjing");await store.prepare(removed);await bind([removed]);
    try {await expect(store.activate(removed.actorId,removed.task.id,randomUUID(),randomUUID())).rejects.toMatchObject({code:"project_not_found"});}
    finally {await pool.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES ($1,'actor-linjing','edit')",[projectId]);}
  });
});
