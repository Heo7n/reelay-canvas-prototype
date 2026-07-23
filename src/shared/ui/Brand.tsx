import { Link } from "react-router-dom";

import wordmarkUrl from "../../../assets/home/reelay-wordmark.png";
import styles from "./Brand.module.css";

interface BrandProps {
  className?: string;
  to: string;
}

export function Brand({ className = "", to }: BrandProps) {
  return (
    <Link className={`${styles.brand} ${className}`.trim()} to={to} aria-label="Reelay 立画主页">
      <span className={styles.crop} aria-hidden="true">
        <img src={wordmarkUrl} alt="" />
      </span>
    </Link>
  );
}
