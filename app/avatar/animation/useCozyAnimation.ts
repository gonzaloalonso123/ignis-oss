import { useEffect, useRef } from "react";
import { createController } from "./controller";
import type { AnimationConfig } from "../types";

export function useCozyAnimation(config: AnimationConfig) {
  const svgRef = useRef<SVGSVGElement>(null);
  const controller = useRef<ReturnType<typeof createController> | null>(null);
  const initial = useRef(config);
  useEffect(() => {
    if (!svgRef.current) return;
    const instance = createController(svgRef.current, initial.current);
    controller.current = instance;
    return () => {
      instance.dispose();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    controller.current?.update({
      paused: config.paused,
      reducedMotion: config.reducedMotion,
      action: config.action,
    });
  }, [config.paused, config.reducedMotion, config.action]);
  return svgRef;
}
