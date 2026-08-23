import type { ImgHTMLAttributes } from "react";

type CreditIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src">;

export function CreditIcon({ className, ...props }: CreditIconProps) {
  return (
    <img
      {...props}
      className={className}
      src="/assets/icons/credit-spark.svg"
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
    />
  );
}
