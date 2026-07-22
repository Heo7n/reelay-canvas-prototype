import { useCallback, useEffect, useRef, useState } from "react";

export function useTransientNotice(duration = 2800): {
  notice: string;
  showNotice: (message: string) => void;
} {
  const [notice, setNotice] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const showNotice = useCallback((message: string): void => {
    setNotice(message);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(""), duration);
  }, [duration]);

  return { notice, showNotice };
}
