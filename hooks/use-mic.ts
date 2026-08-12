import { useState, useCallback } from "react";

export function useMicPermission() {
  const [granted, setGranted] = useState<boolean | null>(null);

  const request = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setGranted(true);
      return true;
    } catch {
      setGranted(false);
      return false;
    }
  }, []);

  return { granted, request };
}
