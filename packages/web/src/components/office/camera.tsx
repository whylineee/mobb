"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3, MOUSE, TOUCH } from "three";
import {
  CAMERA_OFFSET,
  officeCameraLayout,
  clampOfficeCenter,
  type SceneInsets,
} from "../../lib/office-camera";
import type { Seat } from "./primitives";
type Controls = { target: Vector3; update: () => void };
export function CameraRig({
  focus,
  action,
  reduced,
  insets,
  resetId,
}: {
  focus: Seat | undefined;
  action: { type: string; id: number };
  reduced: boolean;
  insets: SceneInsets;
  resetId: number;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<Controls | null>(null);
  const layout = useMemo(
    () => officeCameraLayout(size.width, size.height, insets),
    [
      size.width,
      size.height,
      insets.left,
      insets.right,
      insets.top,
      insets.bottom,
    ],
  );
  const logical = useRef(new Vector3(0, 0.8, 0));
  const goal = useRef<{ center: Vector3; zoom: number } | null>(null);
  const previousZoom = useRef<number | null>(null);
  const changing = useRef(false);
  const appliedZoom = useRef(layout.baseZoom);
  const apply = useCallback(
    (center: Vector3, zoom: number) => {
      changing.current = true;
      camera.zoom = Math.max(
        layout.baseZoom,
        Math.min(layout.baseZoom * 4, zoom),
      );
      appliedZoom.current = camera.zoom;
      logical.current.copy(
        clampOfficeCenter(center, camera.zoom, layout.baseZoom),
      );
      const target = logical.current.clone().add(layout.offset(camera.zoom));
      controls.current?.target.copy(target);
      camera.position.copy(target).add(CAMERA_OFFSET);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      controls.current?.update();
      changing.current = false;
      invalidate();
    },
    [camera, layout, invalidate],
  );
  useEffect(() => {
    const ratio = previousZoom.current ? camera.zoom / previousZoom.current : 1;
    previousZoom.current = layout.baseZoom;
    goal.current = null;
    apply(logical.current, layout.baseZoom * Math.max(1, Math.min(4, ratio)));
  }, [layout, apply, camera]);
  useEffect(() => {
    goal.current = {
      center: focus
        ? new Vector3(focus[0], 0.8, focus[2])
        : new Vector3(0, 0.8, 0),
      zoom: focus ? layout.baseZoom * 1.65 : layout.baseZoom,
    };
    invalidate();
  }, [focus?.[0], focus?.[2], layout, invalidate]);
  useEffect(() => {
    goal.current = null;
    apply(new Vector3(0, 0.8, 0), layout.baseZoom);
  }, [resetId]);
  useEffect(() => {
    if (!action.id) return;
    goal.current = null;
    apply(
      action.type === "reset" ? new Vector3(0, 0.8, 0) : logical.current,
      action.type === "reset"
        ? layout.baseZoom
        : camera.zoom * (action.type === "in" ? 1.2 : 1 / 1.2),
    );
  }, [action]);
  useFrame((_, delta) => {
    if (!goal.current) return;
    const destination = goal.current;
    const bounded = clampOfficeCenter(
      destination.center.clone(),
      destination.zoom,
      layout.baseZoom,
    );
    const alpha = reduced ? 1 : 1 - Math.exp(-delta * 7);
    apply(
      logical.current.clone().lerp(bounded, alpha),
      camera.zoom + (destination.zoom - camera.zoom) * alpha,
    );
    if (
      logical.current.distanceTo(bounded) < 0.01 &&
      Math.abs(camera.zoom - destination.zoom) < 0.01
    ) {
      goal.current = null;
      apply(bounded, destination.zoom);
    }
  });
  return (
    <OrbitControls
      ref={(value) => {
        controls.current = value;
      }}
      makeDefault
      enableRotate={false}
      enablePan
      enableZoom
      enableDamping={false}
      screenSpacePanning={false}
      minZoom={layout.baseZoom}
      maxZoom={layout.baseZoom * 4}
      mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
      onStart={() => {
        goal.current = null;
      }}
      onChange={() => {
        if (changing.current || !controls.current) return;
        apply(
          controls.current.target
            .clone()
            .sub(layout.offset(appliedZoom.current)),
          camera.zoom,
        );
      }}
    />
  );
}
