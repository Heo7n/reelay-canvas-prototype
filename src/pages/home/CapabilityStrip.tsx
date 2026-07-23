import type { Capability } from "./home-content";
import styles from "./WorkspacePages.module.css";

interface CapabilityStripProps {
  capabilities: Capability[];
  onChoose: (capability: Capability) => void;
}

const capabilityGroups = [
  { id: "plan", label: "策划", capabilityIds: ["storyboard", "agent"] },
  { id: "generate", label: "生成", capabilityIds: ["text-video", "image-video", "character"] },
  { id: "produce", label: "制作", capabilityIds: ["canvas", "assets"] },
] as const;

export function CapabilityStrip({ capabilities, onChoose }: CapabilityStripProps) {
  const capabilityById = new Map(capabilities.map((capability) => [capability.id, capability]));
  const allCapability = capabilityById.get("all");

  function renderCapability(capability: Capability) {
    const Icon = capability.icon;
    return (
      <button key={capability.id} type="button" onClick={() => onChoose(capability)}>
        <Icon aria-hidden="true" />
        <span>{capability.label}</span>
      </button>
    );
  }

  return (
    <div className={styles.capabilities} aria-label="创作能力">
      <span className={styles.capabilitiesLead}>快速开始</span>
      {capabilityGroups.map((group) => (
        <div className={styles.capabilityGroup} key={group.id}>
          <span className={styles.capabilityGroupLabel}>{group.label}</span>
          {group.capabilityIds
            .map((capabilityId) => capabilityById.get(capabilityId))
            .filter((capability): capability is Capability => Boolean(capability))
            .map(renderCapability)}
        </div>
      ))}
      {allCapability ? (
        <div className={styles.capabilityMore}>
          {renderCapability(allCapability)}
        </div>
      ) : null}
    </div>
  );
}
