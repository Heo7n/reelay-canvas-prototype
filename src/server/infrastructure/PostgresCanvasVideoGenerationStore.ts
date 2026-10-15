import type { Pool, PoolClient } from "pg";
import { CanvasVideoGenerationError, canonicalizeCanvasVideoTaskInput, canvasDocumentReferencesTask, type CanvasVideoProjectBinding } from "../../domain/generation/canvas-video-task";
import type { CanvasVideoGenerationStore, CanvasVideoTaskRecord } from "../application/CanvasVideoGenerationStore";

export class PostgresCanvasVideoGenerationStore implements CanvasVideoGenerationStore {
  constructor(private readonly pool: Pool) {}
  async getBinding(actorId: string, userId: string, projectId: string) {
    const result = await this.pool.query<{ binding: CanvasVideoProjectBinding }>("SELECT binding FROM canvas_video_project_bindings WHERE actor_id=$1 AND platform_user_id=$2 AND project_id=$3", [actorId, userId, projectId]);
    return result.rows[0]?.binding ?? null;
  }
  async setBinding(actorId: string, userId: string, connectionId: string, value: CanvasVideoProjectBinding) {
    await this.pool.query(`INSERT INTO canvas_video_project_bindings(actor_id,platform_user_id,project_id,connection_id,binding) VALUES ($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT(actor_id,platform_user_id,project_id) DO UPDATE SET connection_id=EXCLUDED.connection_id,binding=EXCLUDED.binding`, [actorId,userId,value.projectId,connectionId,JSON.stringify(value)]);
    return value;
  }
  async prepare(record: CanvasVideoTaskRecord) {
    record = { ...record, input: canonicalizeCanvasVideoTaskInput(record.input) };
    await this.pool.query(`INSERT INTO canvas_video_tasks(id,actor_id,project_id,request_key,platform_user_id,status,record) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING`, [record.task.id,record.actorId,record.task.projectId,record.task.requestKey,record.platformUserId,record.task.status,JSON.stringify(record)]);
    const result = await this.pool.query<{ record: CanvasVideoTaskRecord }>("SELECT record FROM canvas_video_tasks WHERE actor_id=$1 AND request_key=$2", [record.actorId,record.task.requestKey]);
    const existing = result.rows[0]?.record;
    // Older prepared rows may have omitted this nullable field; normalize
    // exactly that semantic absence, retaining every frozen input value.
    if (!existing || canonical(canonicalizeCanvasVideoTaskInput(existing.input)) !== canonical(record.input)) throw new CanvasVideoGenerationError("request_conflict");
    return { ...existing, input: canonicalizeCanvasVideoTaskInput(existing.input) };
  }
  async get(actorId: string, id: string) {
    await this.recoverInterrupted();
    const result = await this.pool.query<{ record: CanvasVideoTaskRecord }>("SELECT record FROM canvas_video_tasks WHERE id=$1 AND actor_id=$2", [id,actorId]);
    return result.rows[0]?.record ?? null;
  }
  async list(actorId: string, projectId: string) {
    await this.recoverInterrupted();
    const result = await this.pool.query<{ record: CanvasVideoTaskRecord }>("SELECT record FROM canvas_video_tasks WHERE actor_id=$1 AND project_id=$2 ORDER BY record->'task'->>'createdAt' DESC LIMIT 100", [actorId,projectId]);
    return result.rows.map((row) => row.record);
  }
  async getProjectTask(projectId: string, id: string) {
    await this.recoverInterrupted();
    const result=await this.pool.query<{record:CanvasVideoTaskRecord}>("SELECT record FROM canvas_video_tasks WHERE project_id=$1 AND id=$2",[projectId,id]);
    return result.rows[0]?.record ?? null;
  }
  async getResult(projectId: string, id: string) {
    const result = await this.pool.query<{ record: CanvasVideoTaskRecord }>("SELECT record FROM canvas_video_tasks WHERE project_id=$1 AND status='succeeded' AND record->'task'->'result'->>'id'=$2", [projectId,id]);
    return result.rows[0]?.record ?? null;
  }
  async claim(userId: string, operationId: string) { return this.claimUsing(this.pool, userId, operationId); }
  private async claimUsing(client: Pool | PoolClient, userId: string, operationId: string) {
    const result = await client.query(`INSERT INTO real_generation_account_locks(platform_user_id,operation_id) VALUES ($1,$2)
      ON CONFLICT(platform_user_id) DO UPDATE SET heartbeat_at=now() WHERE real_generation_account_locks.operation_id=EXCLUDED.operation_id RETURNING operation_id`, [userId,operationId]);
    return result.rowCount === 1;
  }
  async release(userId: string, operationId: string) { await this.pool.query("DELETE FROM real_generation_account_locks WHERE platform_user_id=$1 AND operation_id=$2", [userId,operationId]); }
  async heartbeat(userId: string, operationId: string) { await this.pool.query("UPDATE real_generation_account_locks SET heartbeat_at=now() WHERE platform_user_id=$1 AND operation_id=$2", [userId,operationId]); }
  async activate(actorId: string, id: string, attemptId: string, ownerProcessId: string) {
    return this.transaction(async (client) => {
      const record = await this.lockTask(client, actorId, id);
      if (record.task.status !== "prepared") return record;
      // Authorization and the saved node reference are checked in the same
      // transaction that claims the account and records the paid attempt.
      await this.authorizeEdit(client,actorId,record.task.projectId);
      const document = await client.query<{ content: unknown }>("SELECT content FROM canvas_documents WHERE project_id=$1 AND canvas_id=$2 FOR SHARE", [record.task.projectId,record.task.canvasDocumentId]);
      if (!document.rows[0] || !canvasDocumentReferencesTask(document.rows[0].content,record.task)) throw new CanvasVideoGenerationError("task_not_bound");
      if (!await this.claimUsing(client,record.platformUserId,id)) throw new CanvasVideoGenerationError("account_busy");
      record.attemptId=attemptId; record.ownerProcessId=ownerProcessId; record.task.status="submitting";
      record.task.updatedAt=new Date().toISOString(); record.task.message="生成请求已可靠记录，正在提交真实平台。";
      await this.writeUsing(client,record); return record;
    });
  }
  async beginSaveRetry(actorId: string,id: string,ownerProcessId: string) {
    return this.transaction(async (client) => {
      const record=await this.lockTask(client,actorId,id);
      if (record.task.status!=="save_failed" || !record.video) throw new CanvasVideoGenerationError("retry_unavailable");
      await this.authorizeEdit(client,actorId,record.task.projectId);
      if (!await this.claimUsing(client,record.platformUserId,id)) throw new CanvasVideoGenerationError("account_busy");
      record.ownerProcessId=ownerProcessId; record.task.status="saving"; await this.writeUsing(client,record); return record;
    });
  }
  async update(record: CanvasVideoTaskRecord) {
    await this.transaction(async (client) => {
      const result=await client.query(`UPDATE canvas_video_tasks SET status=$2,record=$3::jsonb WHERE id=$1 AND status IN ('submitting','waiting','saving') AND record->>'attemptId' IS NOT DISTINCT FROM $4 AND record->>'ownerProcessId' IS NOT DISTINCT FROM $5`, [record.task.id,record.task.status,JSON.stringify(record),record.attemptId,record.ownerProcessId]);
      if (result.rowCount!==1) throw new CanvasVideoGenerationError("request_conflict");
      // Terminal evidence and releasing the paid-account slot are one commit.
      // A crash cannot leave a completed task permanently fencing its account.
      if (["succeeded","failed","save_failed"].includes(record.task.status)) await client.query("DELETE FROM real_generation_account_locks WHERE platform_user_id=$1 AND operation_id=$2",[record.platformUserId,record.task.id]);
    });
  }
  async recoverInterrupted() {
    // A heartbeat is evidence that another process is still running. Stale
    // paid attempts stay fenced; a known video may retry saving only.
    await this.transaction(async (client) => {
      const stale=await client.query<{record:CanvasVideoTaskRecord}>(`SELECT t.record FROM canvas_video_tasks t JOIN real_generation_account_locks l ON l.platform_user_id=t.platform_user_id AND l.operation_id=t.id WHERE t.status IN ('submitting','waiting','saving') AND l.heartbeat_at<now()-interval '60 seconds' FOR UPDATE OF t,l`);
      for (const row of stale.rows) {
        const record=row.record; record.task.status=record.video?"save_failed":"unconfirmed"; record.task.message="执行连接已中断；不会自动再次生成。"; record.task.updatedAt=new Date().toISOString(); record.ownerProcessId=null;
        await this.writeUsing(client,record);
        if (record.video) await client.query("DELETE FROM real_generation_account_locks WHERE platform_user_id=$1 AND operation_id=$2",[record.platformUserId,record.task.id]);
      }
    });
  }
  private async lockTask(client: PoolClient,actorId:string,id:string) {
    const result=await client.query<{record:CanvasVideoTaskRecord}>("SELECT record FROM canvas_video_tasks WHERE id=$1 AND actor_id=$2 FOR UPDATE",[id,actorId]);
    if (!result.rows[0]) throw new CanvasVideoGenerationError("task_not_found"); return result.rows[0].record;
  }
  private async authorizeEdit(client:PoolClient,actorId:string,projectId:string) {
    const membership=await client.query<{role:string}>(`SELECT pm.role FROM projects p JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=$1 WHERE p.id=$2 AND p.deleted_at IS NULL AND (p.access_kind='collaborative' OR p.created_by_user_id=$1) FOR SHARE OF p,pm`,[actorId,projectId]);
    if (!membership.rows[0]) throw new CanvasVideoGenerationError("project_not_found");
    if (membership.rows[0].role === "view") throw new CanvasVideoGenerationError("project_forbidden");
  }
  private async writeUsing(client: PoolClient,record:CanvasVideoTaskRecord) { await client.query("UPDATE canvas_video_tasks SET status=$2,record=$3::jsonb WHERE id=$1",[record.task.id,record.task.status,JSON.stringify(record)]); }
  private async transaction<T>(operation:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client=await this.pool.connect();
    try { await client.query("BEGIN"); const value=await operation(client); await client.query("COMMIT"); return value; }
    catch (error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
    finally { client.release(); }
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
