import { InMemoryAssetStore } from "./InMemoryAssetStore";
import { InMemoryEntityStore } from "./InMemoryEntityStore";
import { verifyMediaLibraryFolderRename, verifyMediaLibraryDeletion, verifyMediaLibraryStore } from "./media-library-store-contract";

async function createFixture() {
  const workspaceId="library-workspace",projectId="library-project",otherProjectId="other-project",owner="owner",editor="editor",outsider="outsider",external="external";
  const store=new InMemoryAssetStore({ workspaceMemberships:[owner,editor,outsider].map((actorId) => ({ workspaceId,actorId,role: actorId === owner ? "owner" as const : "member" as const })),projects:[projectId,otherProjectId].map((id) => ({ id,workspaceId,members:[{ actorId:owner,role:"admin" },{ actorId:editor,role:"edit" },{ actorId:external,role:"edit" }] })) });
  const entities = new InMemoryEntityStore({ workspaceMemberships: [owner,editor,outsider].map((actorId) => ({ workspaceId, actorId })), assets: [], personalAssetPlacements: [] });
  store.connectLibraryEntities(entities);
  return { entities, store,workspaceId,projectId,otherProjectId,owner,editor,outsider,external };
}
verifyMediaLibraryStore(createFixture);
verifyMediaLibraryDeletion(createFixture);
verifyMediaLibraryFolderRename(createFixture);
