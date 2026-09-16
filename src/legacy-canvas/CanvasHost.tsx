import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import type { CanvasDocumentRepository } from "../application/canvases/CanvasDocumentRepository";
import type { EntityRepository, WorkspaceEntity } from "../application/assets/EntityRepository";
import type { MediaAssetRepository, PersonalMediaAsset, ProjectMediaAsset } from "../application/assets/MediaAssetRepository";
import type { TransientMediaRepository } from "../application/assets/TransientMediaRepository";
import { isApplicationError } from "../application/shared/ApplicationError";
import type { CanvasDocument } from "../domain/canvas/canvas-document";
import type { MediaLibraryCatalog } from "../domain/asset/media-library";
import type { MediaUploadPolicy } from "../domain/asset/media-upload-policy";
import { useCanvasNavigation } from "./useCanvasNavigation";
import {
  hostDocumentMessageSchema,
  hostAssetCommandErrorMessageSchema,
  hostAssetAvailabilityMessageSchema,
  hostEntityCommandResultMessageSchema,
  hostFlushMessageSchema,
  hostMediaRenameResultMessageSchema,
  hostMediaLibraryResultMessageSchema,
  hostMediaUploadGrantMessageSchema,
  hostMediaUploadPolicyMessageSchema,
  hostMediaUploadResultMessageSchema,
  hostTransientMediaResultMessageSchema,
  hostMessageSchema,
  hostProjectAssetsMessageSchema,
  hostWorkspaceAssetCatalogMessageSchema,
  hostSaveErrorMessageSchema,
  hostSaveResultMessageSchema,
  legacyCanvasContextSchema,
  parseCanvasMessage,
  type LegacyAccountSection,
  type LegacyCanvasContext,
} from "./bridge-protocol";

interface CanvasHostProps {
  context: LegacyCanvasContext;
  entityRepository?: EntityRepository;
  onCreateProject?: () => void;
  onLogout?: () => void;
  onOpenAccountSettings?: (section: LegacyAccountSection) => void;
  onThemeChange?: (theme: LegacyCanvasContext["theme"]) => void;
  onLaunchPromptConsumed?: () => void;
  repository: CanvasDocumentRepository;
  mediaAssetRepository?: MediaAssetRepository;
  transientMediaRepository?: TransientMediaRepository;
}

type DocumentLoadState =
  | { status: "loading" }
  | { status: "ready"; document: CanvasDocument | null }
  | { status: "error"; reason: "load" | "unavailable" };

type PersistenceStatus = "loading" | "saved" | "dirty" | "saving" | "error";

function bridgeWorkspaceAsset(asset: PersonalMediaAsset) {
  return {
    assetId: asset.id,
    assetVersion: asset.objectVersion,
    mediaKind: asset.mediaKind,
    displayName: asset.displayName,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    checksumSha256: asset.checksumSha256,
    contentUrl: asset.contentUrl,
    createdAt: asset.createdAt,
  };
}

function bridgeWorkspaceEntity(entity: WorkspaceEntity) {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    ...(entity.libraryTagIds !== undefined ? { libraryTagIds: entity.libraryTagIds } : {}),
    mediaRefs: entity.mediaRefs,
    coverAssetId: entity.coverAssetId,
    version: entity.version,
  };
}

export function CanvasHost({ context, entityRepository, mediaAssetRepository, transientMediaRepository, onCreateProject, onLogout, onOpenAccountSettings, onThemeChange, onLaunchPromptConsumed, repository }: CanvasHostProps) {
  const location = useLocation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const initializedReadyGenerationRef = useRef(0);
  const activeCanvasInstanceIdRef = useRef<string | null>(null);
  const seenCanvasInstanceIdsRef = useRef(new Set<string>());
  const progressiveCanvasInstanceIdsRef = useRef(new Set<string>());
  const assetDeliveryRef = useRef({ instanceId: "", project: false, workspace: false, availability: "" });
  const dirtyRef = useRef(false);
  const savingRef = useRef(0);
  const sameScopeInFlightSaveCountRef = useRef(0);
  const authoritativeDocumentNeedsRefreshRef = useRef(false);
  const authoritativeRefreshTokenRef = useRef(0);
  const authoritativeRefreshInFlightRef = useRef(false);
  const pendingAssetUploadsRef = useRef(new Map<string, {
    instanceId: string;
    uploadId: string;
    target: "project" | "personal";
  }>());
  const pendingAssetCommandIdsRef = useRef(new Set<string>());
  const entityCatalogTokenRef = useRef(0);
  const libraryReadTokenRef = useRef(0);
  const libraryCommandQueueRef = useRef<Promise<void>>(Promise.resolve());
  const seenTransientUploadIdsRef = useRef(new Set<string>());
  const [readyGeneration, setReadyGeneration] = useState(0);
  const [progressiveAssetLoading, setProgressiveAssetLoading] = useState(false);
  const [sameScopeInFlightSaveCount, setSameScopeInFlightSaveCount] = useState(0);
  const [refreshingAuthoritativeDocument, setRefreshingAuthoritativeDocument] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [documentState, setDocumentState] = useState<DocumentLoadState>({ status: "loading" });
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const [projectAssets, setProjectAssets] = useState<ProjectMediaAsset[]>([]);
  const [projectAssetsLoaded, setProjectAssetsLoaded] = useState(false);
  const [assetPersistenceAvailable, setAssetPersistenceAvailable] = useState(false);
  const [workspaceAssets, setWorkspaceAssets] = useState<PersonalMediaAsset[]>([]);
  const [workspaceEntities, setWorkspaceEntities] = useState<WorkspaceEntity[]>([]);
  const [libraryCatalog, setLibraryCatalog] = useState<MediaLibraryCatalog>();
  const [libraryStatus, setLibraryStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [uploadPolicy, setUploadPolicy] = useState<MediaUploadPolicy | null>(null);
  const [uploadPolicyStatus, setUploadPolicyStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [workspaceCatalogLoaded, setWorkspaceCatalogLoaded] = useState(false);
  const [entityPersistenceAvailable, setEntityPersistenceAvailable] = useState(false);
  const assetAccessRef = useRef({ media: false, personal: false, entity: false });
  assetAccessRef.current = {
    // Every finalized upload also creates personal placement; do not race its initial catalog.
    media: assetPersistenceAvailable && (!progressiveAssetLoading || workspaceCatalogLoaded || libraryStatus === "ready"),
    personal: assetPersistenceAvailable && (mediaAssetRepository?.library
      ? libraryStatus === "ready" || (libraryStatus === "loading" && workspaceCatalogLoaded)
      : !progressiveAssetLoading || entityPersistenceAvailable),
    entity: entityPersistenceAvailable,
  };
  const safeContext = useMemo(() => legacyCanvasContextSchema.parse(context), [context]);
  const projectAuthorizationKey = JSON.stringify((safeContext.projects ?? []).map((project) => project.id));
  const authorizedProjectIds = useMemo(
    () => new Set(JSON.parse(projectAuthorizationKey) as string[]),
    [projectAuthorizationKey],
  );
  const frameSource = useMemo(() => {
    const query = new URLSearchParams({
      workspaceId: safeContext.workspaceId,
      projectId: safeContext.projectId,
      canvasId: safeContext.canvasId,
    });
    if (import.meta.env.DEV && new URLSearchParams(location.search).get("layoutTune") === "1") {
      query.set("layoutTune", "1");
    }
    return `/index.html?${query.toString()}`;
  }, [location.search, safeContext.canvasId, safeContext.projectId, safeContext.workspaceId]);

  const postToCanvas = useCallback((message: unknown): void => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  const requestFlush = useCallback((): void => {
    postToCanvas(hostFlushMessageSchema.parse({
      source: "reelay-shell",
      type: "host:flush",
      protocolVersion: 1,
    }));
  }, [postToCanvas]);

  const hasPendingWrites = useCallback(() => dirtyRef.current || savingRef.current > 0, []);
  const onNavigationTimeout = useCallback(() => setPersistenceStatus("error"), []);
  const { queueNavigation, finishPendingNavigation, cancelPendingNavigation } = useCanvasNavigation({
    workspaceId: safeContext.workspaceId,
    hasPendingWrites,
    requestFlush,
    onTimeout: onNavigationTimeout,
    onCreateProject,
    onLogout,
  });

  const sendInit = useCallback((instanceId: string): void => {
    if (
      documentState.status !== "ready"
      || activeCanvasInstanceIdRef.current !== instanceId
    ) return;
    const message = hostMessageSchema.parse({
      source: "reelay-shell",
      type: "host:init",
      context: {
        ...safeContext,
        capabilities: {
          accountSections: safeContext.capabilities?.accountSections === true,
          projectSwitcher: safeContext.capabilities?.projectSwitcher,
          ...(safeContext.capabilities?.transientMediaUpload === undefined ? {} : {
            transientMediaUpload: Boolean(safeContext.capabilities.transientMediaUpload && transientMediaRepository),
          }),
          ...(safeContext.capabilities?.assetPersistence === undefined
            ? {}
            : { assetPersistence: !progressiveAssetLoading && assetPersistenceAvailable }),
          ...(safeContext.capabilities?.entityPersistence === undefined
            ? {}
            : { entityPersistence: !progressiveAssetLoading && entityPersistenceAvailable }),
          ...(progressiveAssetLoading ? { progressiveAssetLoading: true } : {}),
        },
      },
    });
    postToCanvas(message);
    postToCanvas(hostDocumentMessageSchema.parse({
      source: "reelay-shell",
      type: "host:document",
      protocolVersion: 1,
      document: documentState.document,
      writable: safeContext.writable,
    }));
    if (safeContext.launchPrompt) onLaunchPromptConsumed?.();
    if (!progressiveAssetLoading && assetPersistenceAvailable) {
      postToCanvas(hostProjectAssetsMessageSchema.parse({
        source: "reelay-shell",
        type: "host:project-assets",
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        instanceId,
        projectAssets,
      }));
    }
    if (!progressiveAssetLoading && safeContext.capabilities?.entityPersistence !== undefined && workspaceCatalogLoaded) {
      postToCanvas(hostWorkspaceAssetCatalogMessageSchema.parse({
        source: "reelay-shell",
        type: "host:workspace-asset-catalog",
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        instanceId,
        assets: workspaceAssets.map(bridgeWorkspaceAsset),
        entities: workspaceEntities.map(bridgeWorkspaceEntity),
        ...(libraryCatalog ? { libraryCatalog } : {}),
      }));
    }
    setPersistenceStatus(savingRef.current > 0
      ? "saving"
      : (dirtyRef.current ? "dirty" : "saved"));
  }, [assetPersistenceAvailable, documentState, entityPersistenceAvailable, libraryCatalog, onLaunchPromptConsumed, postToCanvas, progressiveAssetLoading, projectAssets, safeContext, transientMediaRepository, workspaceAssets, workspaceCatalogLoaded, workspaceEntities]);

  const refreshAuthoritativeDocument = useCallback((): void => {
    if (authoritativeRefreshInFlightRef.current) return;
    const refreshToken = authoritativeRefreshTokenRef.current + 1;
    authoritativeRefreshTokenRef.current = refreshToken;
    authoritativeRefreshInFlightRef.current = true;
    setRefreshingAuthoritativeDocument(true);
    setDocumentState({ status: "loading" });
    setPersistenceStatus("loading");
    void repository.getCanvasDocument(safeContext.projectId, safeContext.canvasId).then(
      (document) => {
        if (authoritativeRefreshTokenRef.current !== refreshToken) return;
        authoritativeDocumentNeedsRefreshRef.current = false;
        setDocumentState({ status: "ready", document });
      },
      (error: unknown) => {
        if (authoritativeRefreshTokenRef.current !== refreshToken) return;
        setDocumentState({
          status: "error",
          reason: isApplicationError(error, "not_found") ? "unavailable" : "load",
        });
        setPersistenceStatus("error");
      },
    ).finally(() => {
      if (authoritativeRefreshTokenRef.current !== refreshToken) return;
      authoritativeRefreshInFlightRef.current = false;
      setRefreshingAuthoritativeDocument(false);
    });
  }, [repository, safeContext.canvasId, safeContext.projectId]);

  useEffect(() => {
    let active = true;
    initializedReadyGenerationRef.current = 0;
    activeCanvasInstanceIdRef.current = null;
    seenCanvasInstanceIdsRef.current.clear();
    progressiveCanvasInstanceIdsRef.current.clear();
    assetDeliveryRef.current = { instanceId: "", project: false, workspace: false, availability: "" };
    setProgressiveAssetLoading(false);
    sameScopeInFlightSaveCountRef.current = 0;
    authoritativeDocumentNeedsRefreshRef.current = false;
    authoritativeRefreshTokenRef.current += 1;
    authoritativeRefreshInFlightRef.current = false;
    setReadyGeneration(0);
    setSameScopeInFlightSaveCount(0);
    setRefreshingAuthoritativeDocument(false);
    dirtyRef.current = false;
    savingRef.current = 0;
    cancelPendingNavigation();
    pendingAssetUploadsRef.current.clear();
    pendingAssetCommandIdsRef.current.clear();
    libraryReadTokenRef.current += 1;
    entityCatalogTokenRef.current += 1;
    libraryCommandQueueRef.current = Promise.resolve();
    seenTransientUploadIdsRef.current.clear();
    setDocumentState({ status: "loading" });
    setProjectAssets([]);
    setProjectAssetsLoaded(false);
    setAssetPersistenceAvailable(false);
    setWorkspaceAssets([]);
    setWorkspaceEntities([]);
    setLibraryCatalog(undefined);
    setUploadPolicy(null);
    setUploadPolicyStatus(mediaAssetRepository ? "loading" : "unavailable");
    setLibraryStatus(mediaAssetRepository?.library ? "loading" : "unavailable");
    setWorkspaceCatalogLoaded(false);
    setEntityPersistenceAvailable(false);
    setPersistenceStatus("loading");
    void repository.getCanvasDocument(safeContext.projectId, safeContext.canvasId).then(
      (document) => {
        if (!active) return;
        authoritativeDocumentNeedsRefreshRef.current = false;
        setDocumentState({ status: "ready", document });
        setPersistenceStatus("saved");
        if (mediaAssetRepository?.getUploadPolicy) {
          void mediaAssetRepository.getUploadPolicy(safeContext.workspaceId).then(
            (policy) => { if (active) { setUploadPolicy(policy); setUploadPolicyStatus("ready"); } },
            () => { if (active) setUploadPolicyStatus("unavailable"); },
          );
        }
        // Keep catalog reads off the document's critical path and shared connection pool.
        // An obsolete load attempt must not start a new batch after navigation or retry.
        if (safeContext.capabilities?.assetPersistence && mediaAssetRepository) {
          void mediaAssetRepository.listProjectAssets(safeContext.projectId).then(
            (assets) => {
              if (!active) return;
              setProjectAssets(assets);
              setAssetPersistenceAvailable(true);
              setProjectAssetsLoaded(true);
            },
            () => {
              if (!active) return;
              setProjectAssets([]);
              setAssetPersistenceAvailable(false);
              setProjectAssetsLoaded(true);
            },
          );
        } else {
          setProjectAssetsLoaded(true);
        }
        if (
          safeContext.capabilities?.assetPersistence
          && safeContext.capabilities?.entityPersistence
          && mediaAssetRepository
          && entityRepository
        ) {
          const initialLibraryToken = libraryReadTokenRef.current;
          const initialEntityToken = entityCatalogTokenRef.current;
          void Promise.allSettled([
            mediaAssetRepository.listPersonalAssets(safeContext.workspaceId),
            entityRepository.listPersonal(safeContext.workspaceId),
            mediaAssetRepository.library?.list(safeContext.workspaceId) ?? Promise.resolve(undefined),
          ]).then(
            ([assets, entities, library]) => {
              if (!active) return;
              const personalAssets = assets.status === "fulfilled" ? assets.value :
                library.status === "fulfilled" && library.value ? library.value.entries
                  .filter((entry) => entry.space === "personal")
                  .map((entry): PersonalMediaAsset => ({
                    id: entry.assetId, workspaceId: safeContext.workspaceId, objectVersion: entry.assetVersion,
                    mediaKind: entry.mediaKind, displayName: entry.displayName, contentType: entry.contentType,
                    byteSize: entry.byteSize, checksumSha256: entry.checksumSha256, contentUrl: entry.contentUrl,
                    createdAt: entry.createdAt, updatedAt: entry.createdAt,
                  })) : [];
              const personalIds = new Set(personalAssets.map((asset) => asset.id));
              const personalAvailable = assets.status === "fulfilled" || (library.status === "fulfilled" && Boolean(library.value));
              const entitiesAvailable = personalAvailable && entities.status === "fulfilled"
                && entities.value.every((entity) => entity.mediaRefs.every((reference) => personalIds.has(reference.assetId)));
              if (entityCatalogTokenRef.current === initialEntityToken) {
                setWorkspaceAssets(personalAssets);
                setWorkspaceEntities(entitiesAvailable ? entities.value : []);
                setEntityPersistenceAvailable(entitiesAvailable);
              }
              // A dialog may already have read or changed the library while Entity
              // loading is pending. The initial read must not replace that newer snapshot.
              if (libraryReadTokenRef.current === initialLibraryToken) {
                setLibraryCatalog(library.status === "fulfilled" ? library.value : undefined);
                setLibraryStatus(library.status === "fulfilled" && library.value ? "ready" : "unavailable");
              }
              setWorkspaceCatalogLoaded(true);
            },
            () => {
              if (!active) return;
              setWorkspaceAssets([]);
              setWorkspaceEntities([]);
              setLibraryStatus("unavailable");
              setEntityPersistenceAvailable(false);
              setWorkspaceCatalogLoaded(true);
            },
          );
        } else {
          setLibraryStatus("unavailable");
          setWorkspaceCatalogLoaded(true);
        }
      },
      (error: unknown) => {
        if (active) {
          setDocumentState({
            status: "error",
            reason: isApplicationError(error, "not_found") ? "unavailable" : "load",
          });
          setPersistenceStatus("error");
        }
      },
    );
    return () => {
      active = false;
      cancelPendingNavigation();
    };
  }, [cancelPendingNavigation, entityRepository, loadAttempt, mediaAssetRepository, repository, safeContext.canvasId, safeContext.capabilities?.assetPersistence, safeContext.capabilities?.entityPersistence, safeContext.projectId, safeContext.workspaceId]);

  const retryDocumentLoad = useCallback((): void => {
    setDocumentState({ status: "loading" });
    setPersistenceStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (
      readyGeneration === 0 ||
      sameScopeInFlightSaveCount > 0 ||
      refreshingAuthoritativeDocument ||
      authoritativeDocumentNeedsRefreshRef.current ||
      documentState.status !== "ready" ||
      (!progressiveAssetLoading && (!projectAssetsLoaded || !workspaceCatalogLoaded)) ||
      initializedReadyGenerationRef.current === readyGeneration
    ) return;
    const instanceId = activeCanvasInstanceIdRef.current;
    if (!instanceId) return;
    initializedReadyGenerationRef.current = readyGeneration;
    sendInit(instanceId);
  }, [documentState.status, progressiveAssetLoading, projectAssetsLoaded, readyGeneration, refreshingAuthoritativeDocument, sameScopeInFlightSaveCount, sendInit, workspaceCatalogLoaded]);

  useEffect(() => {
    const instanceId = activeCanvasInstanceIdRef.current;
    if (!mediaAssetRepository?.getUploadPolicy || !instanceId || readyGeneration === 0 || documentState.status !== "ready"
      || initializedReadyGenerationRef.current !== readyGeneration) return;
    postToCanvas(hostMediaUploadPolicyMessageSchema.parse({
      source: "reelay-shell", type: "host:media-upload-policy", protocolVersion: 1,
      instanceId, policy: uploadPolicy, status: uploadPolicyStatus,
    }));
  }, [documentState.status, mediaAssetRepository, postToCanvas, readyGeneration, uploadPolicy, uploadPolicyStatus,
    projectAssetsLoaded, workspaceCatalogLoaded, progressiveAssetLoading, refreshingAuthoritativeDocument, sameScopeInFlightSaveCount]);

  useEffect(() => {
    const instanceId = activeCanvasInstanceIdRef.current;
    if (!progressiveAssetLoading || !instanceId || readyGeneration === 0
      || initializedReadyGenerationRef.current !== readyGeneration || documentState.status !== "ready") return;
    if (assetDeliveryRef.current.instanceId !== instanceId) {
      assetDeliveryRef.current = { instanceId, project: false, workspace: false, availability: "" };
    }
    const delivered = assetDeliveryRef.current;
    if (projectAssetsLoaded && !delivered.project) {
      delivered.project = true;
      if (assetPersistenceAvailable) postToCanvas(hostProjectAssetsMessageSchema.parse({
        source: "reelay-shell", type: "host:project-assets", protocolVersion: 1,
        requestId: crypto.randomUUID(), instanceId, projectAssets,
      }));
    }
    if (workspaceCatalogLoaded && !delivered.workspace) {
      delivered.workspace = true;
      if (entityPersistenceAvailable || libraryCatalog) postToCanvas(hostWorkspaceAssetCatalogMessageSchema.parse({
        source: "reelay-shell", type: "host:workspace-asset-catalog", protocolVersion: 1,
        requestId: crypto.randomUUID(), instanceId,
        assets: workspaceAssets.map(bridgeWorkspaceAsset), entities: workspaceEntities.map(bridgeWorkspaceEntity),
        ...(libraryCatalog ? { libraryCatalog } : {}),
      }));
    }
    const message = hostAssetAvailabilityMessageSchema.parse({
      source: "reelay-shell", type: "host:asset-availability", protocolVersion: 1, instanceId,
      projectAssets: !projectAssetsLoaded ? "loading" : assetPersistenceAvailable ? "ready" : "unavailable",
      workspaceCatalog: !workspaceCatalogLoaded ? "loading" : entityPersistenceAvailable ? "ready" : "unavailable",
      ...(mediaAssetRepository?.library ? { mediaLibrary: libraryStatus } : {}),
    });
    const key = JSON.stringify(message);
    if (delivered.availability !== key) {
      delivered.availability = key;
      // Ordered after the corresponding catalog, so writes cannot race its application.
      postToCanvas(message);
    }
  }, [assetPersistenceAvailable, documentState.status, entityPersistenceAvailable, postToCanvas, progressiveAssetLoading,
    projectAssets, projectAssetsLoaded, readyGeneration, refreshingAuthoritativeDocument, sameScopeInFlightSaveCount,
    libraryCatalog, libraryStatus, mediaAssetRepository, workspaceAssets, workspaceCatalogLoaded, workspaceEntities]);

  useEffect(() => {
    const flushIfNeeded = (): void => {
      if (dirtyRef.current || savingRef.current > 0) requestFlush();
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") flushIfNeeded();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!dirtyRef.current && savingRef.current === 0) return;
      flushIfNeeded();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("pagehide", flushIfNeeded);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushIfNeeded);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestFlush]);

  useEffect(() => {
    let active = true;
    const sendSaveError = (
      requestId: string,
      code: "conflict" | "forbidden" | "missing" | "network",
    ): void => {
      postToCanvas(hostSaveErrorMessageSchema.parse({
        source: "reelay-shell",
        type: "host:save-error",
        protocolVersion: 1,
        requestId,
        code,
      }));
    };
    const sendAssetError = (
      requestId: string,
      instanceId: string,
      code: "invalid" | "forbidden" | "missing" | "conflict" | "network" | "unsupported",
      message?: string,
      serviceCode?: string,
    ): void => {
      postToCanvas(hostAssetCommandErrorMessageSchema.parse({
        source: "reelay-shell",
        type: "host:asset-command-error",
        protocolVersion: 1,
        requestId,
        instanceId,
        code,
        ...(message ? { message: message.slice(0, 500) } : {}),
        ...(serviceCode ? { serviceCode: serviceCode.slice(0, 100) } : {}),
      }));
    };
    const assetErrorCode = (error: unknown): "invalid" | "forbidden" | "missing" | "conflict" | "network" => {
      if (isApplicationError(error, "forbidden")) return "forbidden";
      if (isApplicationError(error, "not_found")) return "missing";
      if (isApplicationError(error, "conflict")) return "conflict";
      if (isApplicationError(error, "request_failed") && error.serviceCode?.startsWith("invalid_")) {
        return "invalid";
      }
      return "network";
    };
    const assetErrorMessage = (error: unknown): string | undefined => isApplicationError(error) ? error.message : undefined;
    const assetErrorServiceCode = (error: unknown): string | undefined => isApplicationError(error) ? error.serviceCode : undefined;
    const refreshLibraryCatalog = (instanceId: string, sourceFrame: MessageEventSource | null): void => {
      const library = mediaAssetRepository?.library;
      if (!library) return;
      const token = ++libraryReadTokenRef.current;
      setLibraryCatalog(undefined);
      setLibraryStatus("loading");
      void library.list(safeContext.workspaceId).then((catalog) => {
        if (!active || token !== libraryReadTokenRef.current || sourceFrame !== frameRef.current?.contentWindow
          || instanceId !== activeCanvasInstanceIdRef.current) return;
        assetDeliveryRef.current.workspace = false;
        setLibraryCatalog(catalog);
        setLibraryStatus("ready");
      }).catch(() => {
        if (!active || token !== libraryReadTokenRef.current || instanceId !== activeCanvasInstanceIdRef.current) return;
        setLibraryCatalog(undefined);
        setLibraryStatus("unavailable");
      });
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const message = parseCanvasMessage(event.data);
      if (!message) return;

      if (message.type === "canvas:capabilities") {
        if (!seenCanvasInstanceIdsRef.current.has(message.instanceId)) {
          progressiveCanvasInstanceIdsRef.current.add(message.instanceId);
        }
        return;
      }
      if (message.type === "canvas:ready") {
        if (seenCanvasInstanceIdsRef.current.has(message.instanceId)) return;
        seenCanvasInstanceIdsRef.current.add(message.instanceId);
        activeCanvasInstanceIdRef.current = message.instanceId;
        setProgressiveAssetLoading(progressiveCanvasInstanceIdsRef.current.has(message.instanceId));
        dirtyRef.current = false;
        savingRef.current = 0;
        cancelPendingNavigation();
        setPersistenceStatus("loading");
        setReadyGeneration((generation) => generation + 1);
        if (
          sameScopeInFlightSaveCountRef.current === 0
          && authoritativeDocumentNeedsRefreshRef.current
        ) {
          refreshAuthoritativeDocument();
        }
        return;
      }
      if (message.instanceId !== activeCanvasInstanceIdRef.current) return;
      if (message.type === "canvas:media-library-command") {
        const library = mediaAssetRepository?.library;
        if (!safeContext.capabilities?.assetPersistence || !library) {
          sendAssetError(message.requestId, message.instanceId, "unsupported", "当前素材库暂不可用，请稍后重试。");
          return;
        }
        if (message.command !== "list" && !safeContext.writable) {
          sendAssetError(message.requestId, message.instanceId, "forbidden", "当前项目为只读，无法保存素材。");
          return;
        }
        if ((message.command === "delete" || message.command === "rename-folder" || message.command === "update-tags" || message.command === "delete-tag") && message.space === "organization" && !["owner", "admin"].includes(safeContext.workspace.role)) {
          sendAssetError(message.requestId, message.instanceId, "forbidden", message.command === "rename-folder" ? "只有组织所有者或管理员可以重命名组织文件夹。" : (message.command === "update-tags" || message.command === "delete-tag") ? "只有组织所有者或管理员可以修改组织素材标签。" : "只有组织所有者或管理员可以删除组织素材。");
          return;
        }
        const operationKey = `${message.instanceId}:${message.requestId}`;
        if (pendingAssetCommandIdsRef.current.has(operationKey)) return;
        pendingAssetCommandIdsRef.current.add(operationKey);
        let commandReadToken = 0;
        const sourceFrame = event.source;
        const stillActive = () => active && sourceFrame === frameRef.current?.contentWindow
          && message.instanceId === activeCanvasInstanceIdRef.current;
        const execute = async () => {
          commandReadToken = ++libraryReadTokenRef.current;
          const base = { workspaceId: safeContext.workspaceId };
          switch (message.command) {
            case "list": return library.list(base.workspaceId);
            case "delete-tag": return library.deleteTag({ ...base, space: message.space, tagId: message.tagId, expectedUsageCount: message.expectedUsageCount });
            case "update-tags": return library.updateTags({ ...base, space: message.space,
              operation: message.operation, tagIds: message.tagIds, items: message.items });
            case "delete": {
              const catalog = await library.delete({ ...base, space: message.space, items: message.items });
              if (!stillActive()) return catalog;
              const refreshToken = ++entityCatalogTokenRef.current;
              const deletedEntityIds = new Set(message.space === "personal" ? message.items.filter((item) => item.kind === "entity").map((item) => item.id) : []);
              setWorkspaceEntities((current) => current.filter((entity) => catalog.entityEntries ? catalog.entityEntries.some((entry) => entry.entityId === entity.id && entry.space === "personal") : !deletedEntityIds.has(entity.id)));
              setWorkspaceAssets((current) => current.filter((asset) => catalog.entries.some((entry) => entry.space === "personal" && entry.assetId === asset.id)));
              if (entityRepository) {
                try {
                  const entities = await entityRepository.listPersonal(base.workspaceId);
                  if (stillActive() && entityCatalogTokenRef.current === refreshToken) {
                    setWorkspaceEntities(entities);
                    setEntityPersistenceAvailable(true);
                  }
                } catch {
                  // Deletion is already committed. Keep removed groups absent and expose the catalog read failure separately.
                  if (stillActive() && entityCatalogTokenRef.current === refreshToken) setEntityPersistenceAvailable(false);
                }
              }
              return catalog;
            }
            case "create-folder": return library.createFolder({ ...base,
              space: message.space, parentId: message.parentId, name: message.name });
            case "move-entities": return library.moveEntities({ ...base, space: message.space, folderId: message.folderId, items: message.items });
            case "rename-folder": return library.renameFolder({ ...base, space: message.space, folderId: message.folderId, name: message.name, expectedName: message.expectedName });
            case "create-tag": return library.createTag({ ...base, space: message.space, name: message.name });
            case "save": return library.save({ ...base, projectId: safeContext.projectId,
              space: message.space, folderId: message.folderId, tagIds: message.tagIds, items: message.items });
          }
        };
        // Reads and writes share an order, including when one draft is cancelled
        // during a write and its replacement immediately asks for the catalog.
        const operation = libraryCommandQueueRef.current.then(() => {
          if (!stillActive()) throw new Error("The canvas changed before its library command started.");
          return execute();
        });
        const completion = operation.then(async (initialResult) => {
          let result = initialResult;
          // Upload discovery can invalidate a queued read independently. Never
          // reply with a catalog already known to be stale; writes run only once.
          while (stillActive() && message.command === "list" && commandReadToken !== libraryReadTokenRef.current) {
            result = await execute();
          }
          if (!stillActive()) return;
          const response = hostMediaLibraryResultMessageSchema.parse({
            source: "reelay-shell", type: "host:media-library-result", protocolVersion: 1,
            requestId: message.requestId, instanceId: message.instanceId, command: message.command, result,
          });
          if (response.command !== "list") libraryReadTokenRef.current += 1;
          if (response.command === "list") {
            setLibraryCatalog(response.result);
            setLibraryStatus("ready");
          } else if (response.command === "move-entities" || response.command === "save" || response.command === "delete" || response.command === "update-tags" || response.command === "delete-tag") {
            setLibraryCatalog(response.result);
            setLibraryStatus("ready");
          } else if (response.command === "create-folder" || response.command === "rename-folder") {
            const folder = response.result;
            setLibraryCatalog((current) => current ? { ...current,
              folders: [...current.folders.filter((item) => item.id !== folder.id), folder] } : current);
          } else {
            const tag = response.result;
            setLibraryCatalog((current) => current ? { ...current,
              tags: [...current.tags.filter((item) => item.id !== tag.id), tag] } : current);
          }
          postToCanvas(response);
        }).catch((error: unknown) => {
          if (!stillActive()) return;
          if (message.command === "list" && libraryReadTokenRef.current === commandReadToken) setLibraryStatus("unavailable");
          sendAssetError(message.requestId, message.instanceId, assetErrorCode(error),
            isApplicationError(error) ? error.message : "暂时无法完成，请重试；已填写的内容会保留。", assetErrorServiceCode(error));
        }).finally(() => pendingAssetCommandIdsRef.current.delete(operationKey));
        libraryCommandQueueRef.current = completion;
        void completion;
        return;
      }
      if (message.type === "canvas:import-transient-media") {
        if (!safeContext.capabilities?.transientMediaUpload || !transientMediaRepository || !assetAccessRef.current.media
          || (message.target === "personal" && !assetAccessRef.current.personal)) {
          sendAssetError(message.requestId, message.instanceId, "unsupported");
          return;
        }
        if (!safeContext.writable) {
          sendAssetError(message.requestId, message.instanceId, "forbidden");
          return;
        }
        const operationKey = `${message.instanceId}:${message.requestId}`;
        if (seenTransientUploadIdsRef.current.has(operationKey)) return;
        seenTransientUploadIdsRef.current.add(operationKey);
        const sourceFrame = event.source;
        void transientMediaRepository.importFile({
          workspaceId: safeContext.workspaceId,
          projectId: safeContext.projectId,
          target: message.target,
          displayName: message.displayName,
          mediaKind: message.mediaKind,
          contentType: message.contentType,
          uploadPurpose: message.uploadPurpose,
          storageSpace: message.storageSpace,
          body: message.body,
        }).then(({ asset, projectAsset }) => {
          if (!active || sourceFrame !== frameRef.current?.contentWindow || message.instanceId !== activeCanvasInstanceIdRef.current) return;
          if ((message.target === "project") !== Boolean(projectAsset)) {
            sendAssetError(message.requestId, message.instanceId, "invalid");
            return;
          }
          setWorkspaceAssets((current) => [...current.filter((candidate) => candidate.id !== asset.id), asset]);
          if (projectAsset) setProjectAssets((current) => [
            ...current.filter((candidate) => candidate.referenceId !== projectAsset.referenceId), projectAsset,
          ]);
          postToCanvas(hostTransientMediaResultMessageSchema.parse({
            source: "reelay-shell", type: "host:transient-media-result", protocolVersion: 1,
            requestId: message.requestId, instanceId: message.instanceId,
            ...(projectAsset ? { target: "project", projectAsset } : { target: "personal", workspaceAsset: bridgeWorkspaceAsset(asset) }),
          }));
          refreshLibraryCatalog(message.instanceId, sourceFrame);
        }).catch((error: unknown) => {
          if (active && sourceFrame === frameRef.current?.contentWindow && message.instanceId === activeCanvasInstanceIdRef.current) {
            sendAssetError(message.requestId, message.instanceId, assetErrorCode(error), assetErrorMessage(error));
          }
        });
        return;
      }
      if (message.type === "canvas:create-media-upload") {
        if (safeContext.capabilities?.transientMediaUpload) {
          sendAssetError(message.requestId, message.instanceId, "unsupported");
          return;
        }
        if (!assetAccessRef.current.media || !mediaAssetRepository
          || (message.target === "personal" && !assetAccessRef.current.personal)) {
          sendAssetError(message.requestId, message.instanceId, "unsupported");
          return;
        }
        if (!safeContext.writable) {
          sendAssetError(message.requestId, message.instanceId, "forbidden");
          return;
        }
        if (
          pendingAssetCommandIdsRef.current.has(message.requestId)
          || pendingAssetUploadsRef.current.has(message.requestId)
        ) {
          sendAssetError(message.requestId, message.instanceId, "invalid");
          return;
        }
        pendingAssetCommandIdsRef.current.add(message.requestId);
        const sourceFrame = event.source;
        void mediaAssetRepository.createUploadIntent({
          workspaceId: safeContext.workspaceId,
          idempotencyKey: message.idempotencyKey,
          mediaKind: message.mediaKind,
          displayName: message.displayName,
          contentType: message.contentType,
          byteSize: message.byteSize,
          checksumSha256: message.checksumSha256,
          uploadPurpose: message.uploadPurpose,
          ...(message.target === "project" ? { projectId: safeContext.projectId } : { storageSpace: message.storageSpace }),
        }).then(
          (grant) => {
            pendingAssetCommandIdsRef.current.delete(message.requestId);
            const stillActive = active
              && sourceFrame === frameRef.current?.contentWindow
              && message.instanceId === activeCanvasInstanceIdRef.current;
            if (!stillActive) return;
            pendingAssetUploadsRef.current.set(message.requestId, {
              instanceId: message.instanceId,
              uploadId: grant.uploadIntent.id,
              target: message.target,
            });
            postToCanvas(hostMediaUploadGrantMessageSchema.parse({
              source: "reelay-shell",
              type: "host:media-upload-grant",
              protocolVersion: 1,
              requestId: message.requestId,
              instanceId: message.instanceId,
              ...grant,
            }));
          },
          (error: unknown) => {
            pendingAssetCommandIdsRef.current.delete(message.requestId);
            if (
              active
              && sourceFrame === frameRef.current?.contentWindow
              && message.instanceId === activeCanvasInstanceIdRef.current
            ) sendAssetError(message.requestId, message.instanceId, assetErrorCode(error), assetErrorMessage(error), assetErrorServiceCode(error));
          },
        );
        return;
      }
      if (message.type === "canvas:cancel-media-upload") {
        const pending = pendingAssetUploadsRef.current.get(message.requestId);
        if (!pending || pending.instanceId !== message.instanceId || pending.uploadId !== message.uploadId
          || !mediaAssetRepository?.cancelUpload) return;
        // Cancellation is best effort here; only the service can confirm its terminal
        // state. Unknown network failures retain the original key for idempotent retry.
        void mediaAssetRepository.cancelUpload(safeContext.workspaceId, pending.uploadId).then(
          () => { if (pendingAssetUploadsRef.current.get(message.requestId) === pending) pendingAssetUploadsRef.current.delete(message.requestId); },
          () => undefined,
        );
        return;
      }
      if (message.type === "canvas:finalize-media-upload") {
        const pending = pendingAssetUploadsRef.current.get(message.requestId);
        if (
          !assetAccessRef.current.media
          || !mediaAssetRepository
          || !pending
          || pending.instanceId !== message.instanceId
          || pending.uploadId !== message.uploadId
          || pendingAssetCommandIdsRef.current.has(message.requestId)
        ) {
          sendAssetError(message.requestId, message.instanceId, "invalid");
          return;
        }
        pendingAssetCommandIdsRef.current.add(message.requestId);
        const sourceFrame = event.source;
        void mediaAssetRepository.finalizeUpload(safeContext.workspaceId, pending.uploadId)
          .then(async (finalizedAsset) => {
            const asset: PersonalMediaAsset = {
              ...finalizedAsset,
              contentUrl: `/api/workspaces/${encodeURIComponent(finalizedAsset.workspaceId)}/media-assets/${encodeURIComponent(finalizedAsset.id)}/content`,
            };
            const projectAsset = pending.target === "project"
              ? await mediaAssetRepository.attachToProject(safeContext.projectId, asset.id)
              : null;
            return { asset, projectAsset };
          })
          .then(
            ({ asset, projectAsset }) => {
              pendingAssetCommandIdsRef.current.delete(message.requestId);
              pendingAssetUploadsRef.current.delete(message.requestId);
              const stillActive = active
                && sourceFrame === frameRef.current?.contentWindow
                && message.instanceId === activeCanvasInstanceIdRef.current;
              if (!stillActive) return;
              if (projectAsset) {
                setProjectAssets((current) => [
                  ...current.filter((candidate) => candidate.referenceId !== projectAsset.referenceId),
                  projectAsset,
                ]);
              }
              setWorkspaceAssets((current) => [
                ...current.filter((candidate) => candidate.id !== asset.id),
                asset,
              ]);
              const result = projectAsset
                ? {
                    source: "reelay-shell" as const,
                    type: "host:media-upload-result" as const,
                    protocolVersion: 1 as const,
                    requestId: message.requestId,
                    instanceId: message.instanceId,
                    uploadId: message.uploadId,
                    target: "project" as const,
                    projectAsset,
                  }
                : {
                    source: "reelay-shell" as const,
                    type: "host:media-upload-result" as const,
                    protocolVersion: 1 as const,
                    requestId: message.requestId,
                    instanceId: message.instanceId,
                    uploadId: message.uploadId,
                    target: "personal" as const,
                    workspaceAsset: bridgeWorkspaceAsset(asset),
                  };
              postToCanvas(hostMediaUploadResultMessageSchema.parse(result));
              refreshLibraryCatalog(message.instanceId, sourceFrame);
            },
            (error: unknown) => {
              pendingAssetCommandIdsRef.current.delete(message.requestId);
              pendingAssetUploadsRef.current.delete(message.requestId);
              if (
                active
                && sourceFrame === frameRef.current?.contentWindow
                && message.instanceId === activeCanvasInstanceIdRef.current
              ) sendAssetError(message.requestId, message.instanceId, assetErrorCode(error), assetErrorMessage(error), assetErrorServiceCode(error));
            },
          );
        return;
      }
      if (message.type === "canvas:rename-media") {
        if (!assetAccessRef.current.media || !assetAccessRef.current.personal || !mediaAssetRepository) {
          sendAssetError(message.requestId, message.instanceId, "unsupported");
          return;
        }
        if (!safeContext.writable) {
          sendAssetError(message.requestId, message.instanceId, "forbidden");
          return;
        }
        if (
          pendingAssetCommandIdsRef.current.has(message.requestId)
          || pendingAssetUploadsRef.current.has(message.requestId)
        ) {
          sendAssetError(message.requestId, message.instanceId, "invalid");
          return;
        }
        pendingAssetCommandIdsRef.current.add(message.requestId);
        const sourceFrame = event.source;
        void mediaAssetRepository.renamePersonalAsset(
          safeContext.workspaceId,
          message.assetId,
          message.displayName,
        ).then(
          (renamedAsset) => {
            pendingAssetCommandIdsRef.current.delete(message.requestId);
            const stillActive = active
              && sourceFrame === frameRef.current?.contentWindow
              && message.instanceId === activeCanvasInstanceIdRef.current;
            if (!stillActive) return;
            const asset = renamedAsset;
            setWorkspaceAssets((current) => {
              const assetIndex = current.findIndex((candidate) => candidate.id === asset.id);
              if (assetIndex < 0) return [...current, asset];
              return current.map((candidate, index) => index === assetIndex ? asset : candidate);
            });
            postToCanvas(hostMediaRenameResultMessageSchema.parse({
              source: "reelay-shell",
              type: "host:media-rename-result",
              protocolVersion: 1,
              requestId: message.requestId,
              instanceId: message.instanceId,
              workspaceAsset: bridgeWorkspaceAsset(asset),
            }));
            refreshLibraryCatalog(message.instanceId, sourceFrame);
          },
          (error: unknown) => {
            pendingAssetCommandIdsRef.current.delete(message.requestId);
            if (
              active
              && sourceFrame === frameRef.current?.contentWindow
              && message.instanceId === activeCanvasInstanceIdRef.current
            ) sendAssetError(message.requestId, message.instanceId, assetErrorCode(error));
          },
        );
        return;
      }
      if (message.type === "canvas:create-entity" || message.type === "canvas:update-entity") {
        if (!assetAccessRef.current.entity || !entityRepository) {
          sendAssetError(message.requestId, message.instanceId, "unsupported");
          return;
        }
        if (!safeContext.writable) {
          sendAssetError(message.requestId, message.instanceId, "forbidden");
          return;
        }
        if (pendingAssetCommandIdsRef.current.has(message.requestId)) {
          sendAssetError(message.requestId, message.instanceId, "invalid");
          return;
        }
        pendingAssetCommandIdsRef.current.add(message.requestId);
        const sourceFrame = event.source;
        const operation = message.type === "canvas:create-entity"
          ? entityRepository.create({
              workspaceId: safeContext.workspaceId,
              idempotencyKey: message.idempotencyKey,
              folderId: message.folderId,
              tagIds: message.tagIds,
              name: message.name,
              description: message.description,
              assetIds: message.assetIds,
              coverAssetId: message.coverAssetId,
            })
          : entityRepository.update({
              workspaceId: safeContext.workspaceId,
              entityId: message.entityId,
              expectedVersion: message.expectedVersion,
              tagIds: message.tagIds,
              expectedTagIds: message.expectedTagIds,
              name: message.name,
              description: message.description,
              assetIds: message.assetIds,
              coverAssetId: message.coverAssetId,
            });
        void operation.then(
          (entity) => {
            pendingAssetCommandIdsRef.current.delete(message.requestId);
            const stillActive = active
              && sourceFrame === frameRef.current?.contentWindow
              && message.instanceId === activeCanvasInstanceIdRef.current;
            if (!stillActive) return;
            entityCatalogTokenRef.current += 1;
            setWorkspaceEntities((current) => [
              ...current.filter((candidate) => candidate.id !== entity.id),
              entity,
            ]);
            refreshLibraryCatalog(message.instanceId, sourceFrame);
            postToCanvas(hostEntityCommandResultMessageSchema.parse({
              source: "reelay-shell",
              type: "host:entity-command-result",
              protocolVersion: 1,
              requestId: message.requestId,
              instanceId: message.instanceId,
              entity: bridgeWorkspaceEntity(entity),
            }));
          },
          (error: unknown) => {
            pendingAssetCommandIdsRef.current.delete(message.requestId);
            if (
              active
              && sourceFrame === frameRef.current?.contentWindow
              && message.instanceId === activeCanvasInstanceIdRef.current
            ) sendAssetError(message.requestId, message.instanceId, assetErrorCode(error));
          },
        );
        return;
      }
      if (message.type === "canvas:dirty") {
        dirtyRef.current = message.dirty;
        setPersistenceStatus(message.dirty
          ? (savingRef.current > 0 ? "saving" : "dirty")
          : (savingRef.current > 0 ? "saving" : "saved"));
        if (!message.dirty) finishPendingNavigation();
        return;
      }
      if (message.type === "canvas:navigate") {
        queueNavigation({ kind: "route", target: message.target });
        return;
      }
      if (message.type === "canvas:open-project") {
        const canOpenProject = safeContext.capabilities?.projectSwitcher === true
          && authorizedProjectIds.has(message.projectId);
        if (canOpenProject && message.projectId !== safeContext.projectId) {
          queueNavigation({ kind: "project", projectId: message.projectId });
        }
        return;
      }
      if (message.type === "canvas:create-project") {
        if (safeContext.capabilities?.projectSwitcher === true && onCreateProject) {
          queueNavigation({ kind: "create-project" });
        }
        return;
      }
      if (message.type === "canvas:open-account") {
        onOpenAccountSettings?.(message.section);
        return;
      }
      if (message.type === "canvas:theme-change") {
        onThemeChange?.(message.theme);
        return;
      }
      if (message.type !== "canvas:save") return;

      if (!safeContext.writable) {
        setPersistenceStatus("error");
        cancelPendingNavigation();
        sendSaveError(message.requestId, "forbidden");
        return;
      }

      savingRef.current += 1;
      sameScopeInFlightSaveCountRef.current += 1;
      setSameScopeInFlightSaveCount(sameScopeInFlightSaveCountRef.current);
      setPersistenceStatus("saving");
      const sourceFrame = event.source;
      const sourceInstanceId = message.instanceId;
      void repository.save({
        projectId: safeContext.projectId,
        canvasId: safeContext.canvasId,
        schemaVersion: message.schemaVersion,
        expectedRevision: message.expectedRevision,
        content: message.content,
      }).then(
        (savedDocument) => {
          if (!active) return;
          sameScopeInFlightSaveCountRef.current = Math.max(
            0,
            sameScopeInFlightSaveCountRef.current - 1,
          );
          setSameScopeInFlightSaveCount(sameScopeInFlightSaveCountRef.current);
          setDocumentState((current) => {
            if (
              current.status === "ready"
              && current.document
              && current.document.projectId === savedDocument.projectId
              && current.document.id === savedDocument.id
              && current.document.revision > savedDocument.revision
            ) return current;
            return { status: "ready", document: savedDocument };
          });
          authoritativeDocumentNeedsRefreshRef.current = false;
          const isActiveSource = sourceFrame === frameRef.current?.contentWindow
            && sourceInstanceId === activeCanvasInstanceIdRef.current;
          if (!isActiveSource) return;
          savingRef.current = Math.max(0, savingRef.current - 1);
          setPersistenceStatus(savingRef.current > 0
            ? "saving"
            : (dirtyRef.current ? "dirty" : "saved"));
          postToCanvas(hostSaveResultMessageSchema.parse({
            source: "reelay-shell",
            type: "host:save-result",
            protocolVersion: 1,
            requestId: message.requestId,
            document: savedDocument,
          }));
          finishPendingNavigation();
        },
        (error: unknown) => {
          if (!active) return;
          sameScopeInFlightSaveCountRef.current = Math.max(
            0,
            sameScopeInFlightSaveCountRef.current - 1,
          );
          setSameScopeInFlightSaveCount(sameScopeInFlightSaveCountRef.current);
          authoritativeDocumentNeedsRefreshRef.current = true;
          const isActiveSource = sourceFrame === frameRef.current?.contentWindow
            && sourceInstanceId === activeCanvasInstanceIdRef.current;
          if (!isActiveSource) {
            if (sameScopeInFlightSaveCountRef.current === 0) refreshAuthoritativeDocument();
            return;
          }
          savingRef.current = Math.max(0, savingRef.current - 1);
          setPersistenceStatus("error");
          cancelPendingNavigation();
          if (isApplicationError(error, "conflict")) {
            sendSaveError(message.requestId, "conflict");
            return;
          }
          if (isApplicationError(error, "forbidden")) {
            sendSaveError(message.requestId, "forbidden");
            return;
          }
          if (isApplicationError(error, "not_found")) {
            sendSaveError(message.requestId, "missing");
            setDocumentState({ status: "error", reason: "unavailable" });
            return;
          }
          sendSaveError(message.requestId, "network");
        },
      );
    };
    window.addEventListener("message", handleMessage);
    return () => {
      active = false;
      window.removeEventListener("message", handleMessage);
    };
  }, [authorizedProjectIds, cancelPendingNavigation, entityRepository, finishPendingNavigation, mediaAssetRepository, onCreateProject, onOpenAccountSettings, onThemeChange, postToCanvas, queueNavigation, refreshAuthoritativeDocument, repository, safeContext.canvasId, safeContext.capabilities?.projectSwitcher, safeContext.capabilities?.transientMediaUpload, safeContext.projectId, safeContext.workspaceId, safeContext.workspace.role, safeContext.writable, transientMediaRepository]);

  return (
    <section
      className="legacy-canvas-host"
      aria-label="Reelay 项目画布"
      data-persistence-status={persistenceStatus}
    >
      {documentState.status !== "error" || documentState.reason !== "unavailable" ? (
        <iframe
          ref={frameRef}
          key={frameSource}
          className="legacy-canvas-frame"
          src={frameSource}
          title="Reelay 项目画布"
        />
      ) : null}
      {documentState.status !== "ready" ? (
        <div className="legacy-canvas-state" role={documentState.status === "error" ? "alert" : "status"}>
          {documentState.status === "error" ? (
            <div className="legacy-canvas-state-card">
              <strong>
                {documentState.reason === "unavailable" ? "项目已删除或无法访问" : "暂时无法加载此项目画布"}
              </strong>
              <span>
                {documentState.reason === "unavailable"
                  ? "画布已停止交互，当前窗口不会继续保存任何内容。"
                  : "画布已停止交互，重试成功前不会写入任何内容。"}
              </span>
              <button type="button" onClick={retryDocumentLoad}>重试加载</button>
            </div>
          ) : (
            <span>正在加载项目画布…</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
