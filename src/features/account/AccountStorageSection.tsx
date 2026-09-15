import { useEffect, useState } from "react";
import { HardDrive, RefreshCw } from "lucide-react";

import type { MediaAssetRepository } from "../../application/assets/MediaAssetRepository";
import styles from "./AccountSettingsDialog.module.css";

type StorageUsage = Awaited<ReturnType<NonNullable<MediaAssetRepository["getStorageUsage"]>>>;
type StorageSpace = "personal" | "organization";
type StorageResult = { status: "loading" } | { status: "ready"; value: StorageUsage } | { status: "error"; message: string };

interface AccountStorageSectionProps {
  actorId: string;
  workspaceId: string;
  repository: Pick<MediaAssetRepository, "getStorageUsage">;
  organization?: boolean;
}

function formatBytes(bytes: number): string {
  const unit = bytes >= 1024 ** 3 ? "GB" : "MB";
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: unit === "GB" ? 2 : 1 }).format(bytes / 1024 ** (unit === "GB" ? 3 : 2))} ${unit}`;
}

const spaces = [
  { id: "personal", label: "个人空间", description: "个人项目与资产库" },
  { id: "organization", label: "组织空间", description: "协作项目与组织资产库" },
] as const;

export function AccountStorageSection({ actorId, workspaceId, repository, organization = true }: AccountStorageSectionProps) {
  const scope = `${actorId}:${workspaceId}:${organization}`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ scope: string; results: Record<StorageSpace, StorageResult> }>(() => ({
    scope, results: { personal: { status: "loading" }, organization: { status: "loading" } },
  }));

  useEffect(() => {
    let cancelled = false;
    setState({ scope, results: { personal: { status: "loading" }, organization: { status: "loading" } } });
    for (const { id } of spaces) {
      if (id === "organization" && !organization) continue;
      const update = (result: StorageResult) => {
        if (!cancelled) setState((previous) => ({ scope, results: { ...previous.results, [id]: result } }));
      };
      if (!repository.getStorageUsage) {
        update({ status: "error", message: "当前模式未提供持久存储用量。" });
        continue;
      }
      void repository.getStorageUsage(workspaceId, id).then(
        (value) => update({ status: "ready", value }),
        () => update({ status: "error", message: "暂时无法读取用量，请重试。" }),
      );
    }
    return () => { cancelled = true; };
  }, [scope, workspaceId, repository, revision, organization]);

  return (
    <section className={styles.section} aria-labelledby="account-storage-title">
      <div className={styles.sectionHeading}>
        <h2 id="account-storage-title">存储空间</h2>
        <button type="button" className={styles.storageRefresh} onClick={() => setRevision((value) => value + 1)} aria-label="刷新存储用量">
          <RefreshCw aria-hidden="true" />刷新
        </button>
      </div>
      <div className={styles.storageSpaces}>
        {spaces.map(({ id, label, description }) => {
          if (id === "organization" && !organization) return null;
          const result = state.scope === scope ? state.results[id] : { status: "loading" as const };
          const usage = result.status === "ready" ? result.value : null;
          const occupied = usage ? usage.usedBytes + usage.reservedBytes : 0;
          const usedPercent = usage && usage.limitBytes > 0 ? Math.min(100, usage.usedBytes / usage.limitBytes * 100) : 0;
          const reservedPercent = usage && usage.limitBytes > 0 ? Math.min(100 - usedPercent, usage.reservedBytes / usage.limitBytes * 100) : 0;
          return (
            <section key={id} className={styles.storageSpace} aria-label={label} aria-busy={result.status === "loading"}>
              <div className={styles.storageSpaceHeading}>
                <HardDrive aria-hidden="true" />
                <span><strong>{label}</strong><small>{description}</small></span>
                {usage ? <span className={styles.storageAmount}>{formatBytes(usage.usedBytes)} <span>/ {formatBytes(usage.limitBytes)}</span></span> : null}
              </div>
              {usage ? <>
                <div className={styles.storageTrack} role="meter" aria-label={`${label}已占用容量`} aria-valuemin={0} aria-valuemax={usage.limitBytes} aria-valuenow={Math.min(occupied, usage.limitBytes)} aria-valuetext={`已用 ${formatBytes(usage.usedBytes)}，预留 ${formatBytes(usage.reservedBytes)}，总容量 ${formatBytes(usage.limitBytes)}`}>
                  <span style={{ width: `${usedPercent}%` }} />
                  <span className={styles.storageReserved} style={{ width: `${reservedPercent}%` }} />
                </div>
                <div className={styles.storageMeta}>
                  <span>可用 {formatBytes(usage.availableBytes)}</span>
                  {usage.reservedBytes > 0 ? <span>上传预留 {formatBytes(usage.reservedBytes)}</span> : null}
                </div>
                {occupied >= usage.limitBytes ? <p className={styles.storageNotice}>空间已用完，暂时无法保存新文件。</p> : occupied >= usage.limitBytes * .8 ? <p className={styles.storageNotice}>空间即将用满。</p> : null}
              </> : <p className={styles.storageMeta} role="status">{result.status === "error" ? result.message : "正在读取用量…"}</p>}
            </section>
          );
        })}
      </div>
      <p className={styles.storageExplanation}>容量按原文件计算。同一文件在多个画布或素材组中引用不重复占用；原文件仍被保留时，会继续计入用量。</p>
    </section>
  );
}
