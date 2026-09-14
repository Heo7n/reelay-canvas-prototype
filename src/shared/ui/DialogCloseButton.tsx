import type { ComponentPropsWithRef } from "react";
import { X } from "lucide-react";
import styles from "./DialogCloseButton.module.css";

type DialogCloseButtonProps = Omit<ComponentPropsWithRef<"button">, "children" | "type" | "aria-label"> & {
  "aria-label": string;
};

// Closing a dialog must never implicitly submit its form. Keep a real button
// and forward its ref so the dialog owns focus and dismissal policy.
export function DialogCloseButton({ className, ...props }: DialogCloseButtonProps) {
  return (
    <button {...props} type="button" className={[styles.button, className].filter(Boolean).join(" ")}>
      <X size={20} strokeWidth={1.75} aria-hidden="true" focusable="false" />
    </button>
  );
}
