import type { Capability } from "./home-content";
import styles from "./WorkspacePages.module.css";

interface CapabilityStripProps {
  capabilities: Capability[];
  onChoose: (capability: Capability) => void;
}

export function CapabilityStrip({ capabilities, onChoose }: CapabilityStripProps) {
  return (
    <div className={styles.capabilities} aria-label="创作能力">
      {capabilities.map((capability) => {
        const Icon = capability.icon;
        return (
          <button key={capability.id} type="button" onClick={() => onChoose(capability)}>
            <Icon aria-hidden="true" />
            <span>{capability.label}</span>
          </button>
        );
      })}
    </div>
  );
}
