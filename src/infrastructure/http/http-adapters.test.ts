import { describe, expect, it } from "vitest";

import { createHttpServices } from "./createHttpServices";
import { HttpAccountRepository } from "./HttpAccountRepository";
import { HttpCanvasDocumentRepository } from "./HttpCanvasDocumentRepository";
import { HttpOrganizationRepository } from "./HttpOrganizationRepository";
import { HttpProjectRepository } from "./HttpProjectRepository";
import { HttpSessionGateway } from "./HttpSessionGateway";
import {
  HttpRequestError,
  HttpResponseValidationError,
  type FetchLike,
} from "./HttpApiClient";
import { HttpWorkspaceRepository } from "./HttpWorkspaceRepository";

interface PlannedResponse {
  body?: unknown;
  status?: number;
  statusText?: string;
}

interface CapturedRequest {
  init: RequestInit;
  url: string;
}

function createFetchQueue(...responses: PlannedResponse[]): {
  fetch: FetchLike;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  const queue = [...responses];
  const fetch: FetchLike = async (input, init = {}) => {
    requests.push({ init, url: input.toString() });
    const planned = queue.shift();
    if (!planned) throw new Error("No planned response remains for this request.");
    const status = planned.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(planned.body), {
      status,
      statusText: planned.statusText,
      headers: status === 204 ? undefined : { "Content-Type": "application/json" },
    });
  };
  return { fetch, requests };
}

const actorDto = {
  account: "owner@reelay.test",
  contactEmail: null,
  contactPhone: null,
  id: "actor-owner",
  displayName: "Owner",
  workspaceIds: ["workspace-personal", "workspace-shared"],
};

const organizationDto = {
  id: "workspace-shared",
  kind: "organization",
  name: "Reelay",
  currentUserRole: "owner",
};

const organizationMemberDto = {
  userId: "actor-owner",
  displayName: "Owner",
  loginIdentifier: "owner@reelay.test",
  role: "owner",
};

const projectDto = {
  id: "project-one",
  workspaceId: "workspace-shared",
  accessKind: "private",
  currentUserRole: "admin",
  name: "Brand story",
  updatedAt: "2026-07-22T08:00:00.000Z",
  coverAssetId: null,
};

describe("HttpSessionGateway", () => {
  it("uses cookie credentials and maps validated DTOs into session snapshots", async () => {
    const transport = createFetchQueue(
      { body: { actor: null } },
      { status: 201, body: { actor: actorDto, mode: "demo" } },
      { status: 204 },
    );
    const gateway = new HttpSessionGateway({ baseUrl: "http://127.0.0.1:3100/", fetch: transport.fetch });

    await expect(gateway.getCurrent()).resolves.toEqual({ actor: null });
    await expect(
      gateway.signInWithPassword({ account: "owner@reelay.test", password: "secret" }),
    ).resolves.toEqual({ actor: actorDto });
    await expect(gateway.signOut()).resolves.toBeUndefined();

    expect(transport.requests.map((request) => request.url)).toEqual([
      "http://127.0.0.1:3100/api/session",
      "http://127.0.0.1:3100/api/demo/session",
      "http://127.0.0.1:3100/api/session",
    ]);
    expect(transport.requests.every((request) => request.init.credentials === "include")).toBe(true);
    expect(transport.requests[1]?.init.method).toBe("POST");
    expect(JSON.parse(String(transport.requests[1]?.init.body))).toEqual({
      account: "owner@reelay.test",
      password: "secret",
    });
    expect(transport.requests[2]?.init.method).toBe("DELETE");
  });

  it("rejects malformed success responses at the HTTP boundary", async () => {
    const transport = createFetchQueue({ body: { actor: { ...actorDto, workspaceIds: "not-an-array" } } });
    const gateway = new HttpSessionGateway({ fetch: transport.fetch });

    await expect(gateway.getCurrent()).rejects.toBeInstanceOf(HttpResponseValidationError);
  });
});

describe("HttpWorkspaceRepository", () => {
  it("returns only validated workspaces available to the server session", async () => {
    const transport = createFetchQueue(
      { body: { workspaces: [organizationDto] } },
      { body: { workspaces: [organizationDto] } },
    );
    const repository = new HttpWorkspaceRepository({ fetch: transport.fetch });

    await expect(repository.listForActor("actor-owner")).resolves.toEqual([organizationDto]);
    await expect(repository.getById("workspace-shared")).resolves.toEqual(organizationDto);
  });

  it("does not trust an invalid workspace kind as a domain workspace", async () => {
    const transport = createFetchQueue({
      body: { workspaces: [{ ...organizationDto, kind: "shared" }] },
    });
    const repository = new HttpWorkspaceRepository({ fetch: transport.fetch });

    await expect(repository.listForActor("actor-owner")).rejects.toBeInstanceOf(HttpResponseValidationError);
  });
});

describe("HttpAccountRepository", () => {
  it("persists optional contact channels without treating the login identifier as an email", async () => {
    const updatedActor = {
      ...actorDto,
      contactEmail: "reports@example.com",
      contactPhone: "+86 138 0000 0000",
    };
    const transport = createFetchQueue({ body: { actor: updatedActor } });
    const repository = new HttpAccountRepository({ baseUrl: "/backend", fetch: transport.fetch });

    await expect(repository.updateContacts({
      contactEmail: updatedActor.contactEmail,
      contactPhone: updatedActor.contactPhone,
    })).resolves.toEqual(updatedActor);

    expect(transport.requests[0]?.url).toBe("/backend/api/account");
    expect(transport.requests[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(transport.requests[0]?.init.body))).toEqual({
      contactEmail: "reports@example.com",
      contactPhone: "+86 138 0000 0000",
    });
  });
});

describe("HttpOrganizationRepository", () => {
  it("returns validated members from the workspace-scoped endpoint", async () => {
    const transport = createFetchQueue({
      body: {
        members: [
          organizationMemberDto,
          {
            userId: "actor-invited",
            displayName: "Invited member",
            loginIdentifier: null,
            role: "member",
          },
        ],
      },
    });
    const repository = new HttpOrganizationRepository({ baseUrl: "/backend/", fetch: transport.fetch });

    await expect(repository.listMembers("workspace/shared")).resolves.toEqual([
      organizationMemberDto,
      {
        userId: "actor-invited",
        displayName: "Invited member",
        loginIdentifier: null,
        role: "member",
      },
    ]);
    expect(transport.requests[0]?.url).toBe("/backend/api/workspaces/workspace%2Fshared/members");
  });

  it("rejects unknown organization roles before they enter the domain", async () => {
    const transport = createFetchQueue({
      body: { members: [{ ...organizationMemberDto, role: "editor" }] },
    });
    const repository = new HttpOrganizationRepository({ fetch: transport.fetch });

    await expect(repository.listMembers("workspace-shared")).rejects.toBeInstanceOf(
      HttpResponseValidationError,
    );
  });
});

describe("HttpProjectRepository", () => {
  it("maps list, create and update responses and safely encodes route identifiers", async () => {
    const transport = createFetchQueue(
      { body: { projects: [projectDto] } },
      { body: { project: projectDto } },
      { status: 201, body: { project: projectDto } },
      { body: { project: { ...projectDto, name: "Renamed" } } },
      { status: 204 },
    );
    const repository = new HttpProjectRepository({ baseUrl: "/backend/", fetch: transport.fetch });

    await expect(repository.listByWorkspace("workspace/shared")).resolves.toEqual([projectDto]);
    await expect(repository.getById("workspace/shared", "project/one")).resolves.toEqual(projectDto);
    await expect(repository.create("workspace/shared", { name: "Brand story" })).resolves.toEqual(projectDto);
    await expect(
      repository.update("workspace/shared", "project/one", { name: "Renamed" }),
    ).resolves.toEqual({ ...projectDto, name: "Renamed" });
    await expect(repository.moveToTrash("workspace/shared", "project/one")).resolves.toBeUndefined();

    expect(transport.requests.map((request) => request.url)).toEqual([
      "/backend/api/workspaces/workspace%2Fshared/projects",
      "/backend/api/workspaces/workspace%2Fshared/projects/project%2Fone",
      "/backend/api/workspaces/workspace%2Fshared/projects",
      "/backend/api/workspaces/workspace%2Fshared/projects/project%2Fone",
      "/backend/api/workspaces/workspace%2Fshared/projects/project%2Fone",
    ]);
    expect(transport.requests[2]?.init.method).toBe("POST");
    expect(JSON.parse(String(transport.requests[2]?.init.body))).toEqual({
      accessKind: "private",
      name: "Brand story",
    });
    expect(transport.requests[3]?.init.method).toBe("PATCH");
    expect(transport.requests[4]?.init.method).toBe("DELETE");
  });

  it("maps API error envelopes to a stable typed request error", async () => {
    const transport = createFetchQueue({
      status: 403,
      body: { error: { code: "workspace_forbidden", message: "Forbidden" } },
    });
    const repository = new HttpProjectRepository({ fetch: transport.fetch });

    const request = repository.listByWorkspace("workspace-private");
    await expect(request).rejects.toBeInstanceOf(HttpRequestError);
    await expect(request).rejects.toMatchObject({
      status: 403,
      code: "workspace_forbidden",
      message: "Forbidden",
    });
  });

  it("maps a project_not_found response to the repository null contract", async () => {
    const transport = createFetchQueue({
      status: 404,
      body: { error: { code: "project_not_found", message: "Not found" } },
    });
    const repository = new HttpProjectRepository({ fetch: transport.fetch });

    await expect(repository.getById("workspace-shared", "missing")).resolves.toBeNull();
  });

  it("rejects malformed project timestamps before they enter the domain", async () => {
    const transport = createFetchQueue({
      body: { projects: [{ ...projectDto, updatedAt: "yesterday" }] },
    });
    const repository = new HttpProjectRepository({ fetch: transport.fetch });

    await expect(repository.listByWorkspace("workspace-shared")).rejects.toBeInstanceOf(
      HttpResponseValidationError,
    );
  });

  it("rejects unknown project access kinds and current-user roles", async () => {
    const invalidAccessTransport = createFetchQueue({
      body: { projects: [{ ...projectDto, accessKind: "organization" }] },
    });
    const invalidRoleTransport = createFetchQueue({
      body: { projects: [{ ...projectDto, currentUserRole: "owner" }] },
    });

    await expect(
      new HttpProjectRepository({ fetch: invalidAccessTransport.fetch }).listByWorkspace("workspace-shared"),
    ).rejects.toBeInstanceOf(HttpResponseValidationError);
    await expect(
      new HttpProjectRepository({ fetch: invalidRoleTransport.fetch }).listByWorkspace("workspace-shared"),
    ).rejects.toBeInstanceOf(HttpResponseValidationError);
  });
});

describe("HttpCanvasDocumentRepository", () => {
  const documentDto = {
    id: "main canvas",
    projectId: "project/one",
    schemaVersion: 1,
    revision: 3,
    content: { nodes: [{ id: "node-1" }] },
  };

  it("loads nullable documents and saves only the mutable document payload", async () => {
    const transport = createFetchQueue(
      { body: { document: null } },
      { body: { document: documentDto } },
      { body: { document: { ...documentDto, revision: 4 } } },
    );
    const repository = new HttpCanvasDocumentRepository({ baseUrl: "/backend/", fetch: transport.fetch });

    await expect(repository.getCanvasDocument("project/one", "main canvas")).resolves.toBeNull();
    await expect(repository.getCanvasDocument("project/one", "main canvas")).resolves.toEqual(documentDto);
    await expect(repository.save({
      projectId: documentDto.projectId,
      canvasId: documentDto.id,
      schemaVersion: documentDto.schemaVersion,
      content: documentDto.content,
      expectedRevision: 3,
    })).resolves.toEqual({
      ...documentDto,
      revision: 4,
    });

    expect(transport.requests.map((request) => request.url)).toEqual([
      "/backend/api/projects/project%2Fone/canvases/main%20canvas/document",
      "/backend/api/projects/project%2Fone/canvases/main%20canvas/document",
      "/backend/api/projects/project%2Fone/canvases/main%20canvas/document",
    ]);
    expect(transport.requests[2]?.init.method).toBe("PUT");
    expect(JSON.parse(String(transport.requests[2]?.init.body))).toEqual({
      schemaVersion: 1,
      content: documentDto.content,
      expectedRevision: 3,
    });
  });

  it("rejects malformed canvas documents before they enter the domain", async () => {
    const transport = createFetchQueue({
      body: { document: { ...documentDto, revision: -1 } },
    });
    const repository = new HttpCanvasDocumentRepository({ fetch: transport.fetch });

    await expect(repository.getCanvasDocument("project-one", "main")).rejects.toBeInstanceOf(
      HttpResponseValidationError,
    );
  });

  it("preserves the typed revision-conflict error envelope", async () => {
    const transport = createFetchQueue({
      status: 409,
      body: {
        error: {
          code: "canvas_revision_conflict",
          message: "Reload before saving again.",
          currentRevision: 4,
        },
      },
    });
    const repository = new HttpCanvasDocumentRepository({ fetch: transport.fetch });

    await expect(repository.save({
      projectId: documentDto.projectId,
      canvasId: documentDto.id,
      schemaVersion: 1,
      expectedRevision: 3,
      content: documentDto.content,
    })).rejects.toMatchObject({
      status: 409,
      code: "canvas_revision_conflict",
      message: "Reload before saving again.",
    });
  });
});

describe("createHttpServices", () => {
  it("creates all application adapters from one injectable transport configuration", async () => {
    const transport = createFetchQueue({ body: { actor: null } });
    const services = createHttpServices({ baseUrl: "/shared-api", fetch: transport.fetch });

    await expect(services.sessionGateway.getCurrent()).resolves.toEqual({ actor: null });
    expect(services.canvasDocumentRepository).toBeInstanceOf(HttpCanvasDocumentRepository);
    expect(services.accountRepository).toBeInstanceOf(HttpAccountRepository);
    expect(services.organizationRepository).toBeInstanceOf(HttpOrganizationRepository);
    expect(services.workspaceRepository).toBeInstanceOf(HttpWorkspaceRepository);
    expect(services.projectRepository).toBeInstanceOf(HttpProjectRepository);
    expect(transport.requests[0]?.url).toBe("/shared-api/api/session");
  });
});
