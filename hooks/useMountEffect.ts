import { useEffect } from "react";

export function useMountEffect(effect: () => void | (() => void)) {
  // Centralize intentional mount-only external system setup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
