"use client";
import { memo, useState, type RefObject } from "react";
import { Html } from "@react-three/drei";
import { PawPrint } from "lucide-react";
import { sessionStatus, type Session } from "@agentwatch/shared";
import { agentName, STATUS_LABELS } from "../Status";
import { AgentMascot } from "../AgentMascot";
import { Box, type Seat } from "./primitives";
export const Desk = memo(function Desk({
  session,
  seat,
  selected,
  labels,
  reducedMotion,
  onSelect,
  portal,
}: {
  session?: Session;
  seat: Seat;
  selected: boolean;
  labels: boolean;
  reducedMotion: boolean;
  onSelect: (key: string | null) => void;
  portal: RefObject<HTMLDivElement | null>;
}) {
  const status = session ? sessionStatus(session) : "ended",
    screen =
      status === "working"
        ? "#71c6a1"
        : status === "waiting"
          ? "#d8b875"
          : "#799c8a";
  const [hovered, setHovered] = useState(false);
  return (
    <group
      position={seat}
      onClick={(e) => {
        e.stopPropagation();
        if (session && e.delta <= 5) onSelect(session.key);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (session) {
          setHovered(true);
          document.body.style.cursor = "pointer";
        }
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      {(selected || hovered) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0.25]}>
          <ringGeometry args={[1.25, 1.33, 40]} />
          <meshBasicMaterial
            color={selected ? "#a4f0ce" : "#8eaa9c"}
            transparent
            opacity={selected ? 0.9 : 0.35}
          />
        </mesh>
      )}
      <group rotation={[0, Math.PI, 0]}>
        <Box
          position={[0, 1.17, -0.22]}
          size={[2.55, 0.16, 1.65]}
          color="#d7c3a1"
          rounded
        />
        {[-1.02, 1.02].flatMap((x) =>
          [-0.8, 0.4].map((z) => (
            <Box
              key={`${x}:${z}`}
              position={[x, 0.57, z]}
              size={[0.09, 1.12, 0.09]}
              color="#52665b"
            />
          )),
        )}
        <Box
          position={[0, 1.39, -0.65]}
          size={[0.1, 0.35, 0.1]}
          color="#3b4f45"
        />
        <Box
          position={[0, 1.27, -0.65]}
          size={[0.55, 0.05, 0.3]}
          color="#3b4f45"
          rounded
        />
        <Box
          position={[0, 1.77, -0.65]}
          size={[1.17, 0.74, 0.09]}
          color="#34463e"
          rounded
        />
        <Box
          position={[0, 1.78, -0.592]}
          size={[1.04, 0.61, 0.02]}
          color="#2b4940"
          emissive={screen}
          emissiveIntensity={status === "ended" ? 0.02 : 0.23}
        />
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            position={[-0.16 + i * 0.07, 1.96 - i * 0.14, -0.576]}
            size={[0.55 - i * 0.12, 0.027, 0.012]}
            color={screen}
            emissive={screen}
            emissiveIntensity={0.3}
          />
        ))}
        <Box
          position={[0, 1.28, 0.14]}
          size={[0.8, 0.035, 0.32]}
          color="#8f9c85"
          rounded
        />
        <Box
          position={[0.92, 1.36, -0.3]}
          size={[0.16, 0.22, 0.16]}
          color={session?.provider === "codex" ? "#a6c1a6" : "#c59b74"}
          rounded
        />
        <Box
          position={[0, 0.55, 0.95]}
          size={[0.85, 0.15, 0.8]}
          color="#526b5d"
          rounded
        />
        <Box
          position={[0, 0.22, 0.95]}
          size={[0.1, 0.5, 0.1]}
          color="#3e5348"
        />
        <Box
          position={[0, 1.03, 1.32]}
          size={[0.8, 0.8, 0.12]}
          color="#526b5d"
          rounded
        />
        <Box
          position={[0, 0.17, 0.95]}
          size={[0.8, 0.07, 0.12]}
          color="#3e5348"
        />
      </group>
      {session && (
        <group position={[0, 0.23, -0.7]} scale={0.85}>
          <AgentMascot session={session} reducedMotion={reducedMotion} />
        </group>
      )}
      {session && (labels || selected || hovered) && (
        <Html
          portal={portal as RefObject<HTMLElement>}
          center
          position={[0, 2.85, -0.7]}
          zIndexRange={[20, 0]}
        >
          <button
            data-testid="robot-label"
            className={`robot-label ${selected ? "robot-selected" : ""} robot-${session.provider}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(session.key);
            }}
            aria-label={`Вибрати ${agentName(session.provider)} ${session.sessionId}`}
          >
            <PawPrint size={12} aria-hidden="true" />
            <span className={`robot-dot dot-${status}`} aria-hidden="true" />
            <span className="robot-tooltip">
              <strong>{agentName(session.provider)}</strong>
              <small>{session.sessionId}</small>
              <strong>{session.project}</strong>
              {STATUS_LABELS[status]}
              <small>
                {session.task?.text.slice(0, 100) ?? "Задача невідома"}
              </small>
            </span>
          </button>
        </Html>
      )}
    </group>
  );
});
