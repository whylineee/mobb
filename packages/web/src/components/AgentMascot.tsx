"use client";
import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { createInstances } from "@react-three/drei";
import type { Group } from "three";
import { sessionStatus, type Session } from "@agentwatch/shared";
import { createMascotGeometry } from "../lib/mascot-geometry";

const [BodyInstances, Body] = createInstances();
const [ArmInstances, Arm] = createInstances();
const FUR = "#d92125";
const FUR_SHADOW = "#b91b23";

// Static face/body batches stay separate from the four animated arm pieces.
export function MascotInstances({
  shadows,
  children,
}: {
  shadows: boolean;
  children: ReactNode;
}) {
  const geometry = useMemo(createMascotGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Fixed buffers cover the bounded 200-session overview, including a retained selection.
  return (
    <BodyInstances
      frames={1}
      limit={256}
      geometry={geometry}
      castShadow={shadows}
    >
      <meshLambertMaterial vertexColors />
      <ArmInstances limit={1024} castShadow={shadows}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshLambertMaterial />
        {children}
      </ArmInstances>
    </BodyInstances>
  );
}

// The local face points along +Z, towards the reversed workstation's screen.
export const AgentMascot = memo(function AgentMascot({
  session,
  reducedMotion,
}: {
  session: Session;
  reducedMotion: boolean;
}) {
  const left = useRef<Group>(null),
    right = useRef<Group>(null);
  const status = sessionStatus(session);
  const working = status === "working";
  useFrame(({ clock }) => {
    if (reducedMotion || !working || !left.current || !right.current) return;
    left.current.rotation.x = -0.7 + Math.sin(clock.elapsedTime * 10) * 0.07;
    right.current.rotation.x =
      -0.7 + Math.sin(clock.elapsedTime * 10 + 2) * 0.07;
  });
  return (
    <group name="agent-mascot">
      <Body />
      <group
        ref={left}
        position={[-0.61, 1.4, 0]}
        rotation={[working ? -0.7 : -0.12, 0, 0]}
      >
        <Arm position={[0, -0.17, 0]} scale={[0.21, 0.3, 0.2]} color={FUR} />
        <Arm
          position={[0, -0.42, 0.1]}
          scale={[0.21, 0.18, 0.2]}
          color={FUR_SHADOW}
        />
      </group>
      <group
        ref={right}
        position={[0.61, 1.4, 0]}
        rotation={[working ? -0.7 : -0.12, 0, status === "waiting" ? 2.3 : 0]}
      >
        <Arm position={[0, -0.17, 0]} scale={[0.21, 0.3, 0.2]} color={FUR} />
        <Arm
          position={[0, -0.42, 0.1]}
          scale={[0.21, 0.18, 0.2]}
          color={FUR_SHADOW}
        />
      </group>
    </group>
  );
});
