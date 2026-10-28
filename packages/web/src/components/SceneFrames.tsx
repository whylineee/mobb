"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

export const ANIMATION_FPS = 20;

// Tiny typing gestures need timed frames; camera and telemetry invalidate immediately.
export function SceneFrames({
  animated,
  onLowFps,
}: {
  animated: boolean;
  onLowFps: () => void;
}) {
  const { invalidate, gl } = useThree();
  const stats = useRef({
    start: 0,
    count: 0,
    frames: 0,
    slowSamples: 0,
    shadowUpdates: 0,
  });
  // Tiny arm gestures reuse the shadow map; scene changes refresh it once.
  useLayoutEffect(() => {
    const previous = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = previous;
      gl.shadowMap.needsUpdate = true;
    };
  }, [gl]);
  useLayoutEffect(() => {
    gl.shadowMap.needsUpdate = true;
  });
  useEffect(() => {
    stats.current.start = 0;
    stats.current.count = 0;
    stats.current.slowSamples = 0;
    if (!animated) return;
    const timer = setInterval(() => invalidate(), 1000 / ANIMATION_FPS);
    return () => clearInterval(timer);
  }, [animated, invalidate]);
  useFrame(() => {
    const now = performance.now(),
      sample = stats.current;
    sample.frames++;
    if (gl.shadowMap.enabled && gl.shadowMap.needsUpdate)
      sample.shadowUpdates++;
    sample.count++;
    let fps = animated ? (window.__agentwatchPerformance?.fps ?? 0) : 0;
    // Demand rendering intentionally pauses. Idle time is not a slow frame.
    if (animated && !sample.start) sample.start = now;
    if (animated && now - sample.start > 1000) {
      fps = Math.round((sample.count * 1000) / (now - sample.start));
      sample.slowSamples =
        fps < ANIMATION_FPS * 0.7 ? sample.slowSamples + 1 : 0;
      if (sample.slowSamples >= 2) {
        onLowFps();
        sample.slowSamples = 0;
      }
      sample.count = 0;
      sample.start = now;
    }
    window.__agentwatchPerformance = {
      fps,
      frames: sample.frames,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      dpr: gl.getPixelRatio(),
      animationFps: animated ? ANIMATION_FPS : 0,
      shadowUpdates: sample.shadowUpdates,
    };
  });
  return null;
}
