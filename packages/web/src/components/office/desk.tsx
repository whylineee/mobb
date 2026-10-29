"use client";
import { memo, useEffect, useId, useState, type RefObject } from "react";
import { Html } from "@react-three/drei";
import { PawPrint } from "lucide-react";
import { sessionStatus, type Session } from "@agentwatch/shared";
import { agentName, STATUS_LABELS } from "../Status";
import { AgentMascot } from "../AgentMascot";
import { Box, type Seat } from "./primitives";
function WorkLabel({ session }: { session: Session }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (session.activity !== "working" || session.turnStartedAt === undefined)
      return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [session.activity, session.turnStartedAt]);
  const minutes =
    session.activity !== "working" || session.turnStartedAt === undefined
      ? null
      : Math.max(0, Math.floor((now - session.turnStartedAt) / 60_000));
  const action = session.requiresAttention
    ? "Потрібна увага"
    : session.activity === "working"
      ? session.activeTools[0]?.name || "Працює"
      : STATUS_LABELS[sessionStatus(session)];
  return (
    <span className="robot-caption">
      <strong>{session.project || "Проєкт невідомий"}</strong>
      <small>
        {action}
        {minutes !== null ? ` · ${minutes} хв` : ""}
      </small>
    </span>
  );
}
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
        ? "#65e5e4"
        : status === "waiting"
          ? "#ffbd6b"
          : "#7898a9";
  const [hovered, setHovered] = useState(false);
  const descriptionId = useId();
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
          color="#667e8d"
          rounded
        />
        <Box
          position={[0, 1.08, 0.61]}
          size={[2.2, 0.025, 0.025]}
          color="#51c9d7"
          emissive="#51c9d7"
        />
        {[-1.02, 1.02].flatMap((x) =>
          [-0.8, 0.4].map((z) => (
            <Box
              key={`${x}:${z}`}
              position={[x, 0.57, z]}
              size={[0.09, 1.12, 0.09]}
              color="#304958"
            />
          )),
        )}
        <Box
          position={[0, 1.39, -0.65]}
          size={[0.1, 0.35, 0.1]}
          color="#243a49"
        />
        <Box
          position={[0, 1.27, -0.65]}
          size={[0.55, 0.05, 0.3]}
          color="#243a49"
          rounded
        />
        <Box
          position={[0, 1.77, -0.65]}
          size={[1.17, 0.74, 0.09]}
          color="#152b39"
          rounded
        />
        <Box
          position={[0, 1.78, -0.592]}
          size={[1.04, 0.61, 0.02]}
          color="#183e50"
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
        {/* A secondary vertical screen and workstation tower distinguish each station. */}
        <Box
          position={[0.79, 1.65, -0.62]}
          size={[0.48, 0.74, 0.09]}
          color="#152b39"
          rounded
        />
        <Box
          position={[0.79, 1.65, -0.565]}
          size={[0.38, 0.62, 0.02]}
          color="#246077"
          emissive="#246077"
        />
        {[0, 1, 2].map((i) => (
          <Box
            key={`secondary-${i}`}
            position={[0.79, 1.83 - i * 0.15, -0.55]}
            size={[0.24, 0.025, 0.012]}
            color={screen}
            emissive={screen}
          />
        ))}
        <Box
          position={[0.9, 0.4, -0.35]}
          size={[0.42, 0.75, 0.65]}
          color="#1b3545"
          rounded
        />
        <Box
          position={[0.9, 0.42, -0.01]}
          size={[0.22, 0.4, 0.02]}
          color="#4ac7d4"
          emissive="#4ac7d4"
        />
        <Box
          position={[0, 1.28, 0.14]}
          size={[0.8, 0.035, 0.32]}
          color="#748c99"
          rounded
        />
        <Box
          position={[0.92, 1.36, -0.3]}
          size={[0.16, 0.22, 0.16]}
          color={session?.provider === "codex" ? "#68bfca" : "#c29175"}
          rounded
        />
        <Box
          position={[0, 0.55, 0.95]}
          size={[0.85, 0.15, 0.8]}
          color="#385668"
          rounded
        />
        <Box
          position={[0, 0.22, 0.95]}
          size={[0.1, 0.5, 0.1]}
          color="#243d4b"
        />
        <Box
          position={[0, 1.03, 1.32]}
          size={[0.8, 0.8, 0.12]}
          color="#385668"
          rounded
        />
        <Box
          position={[0, 0.17, 0.95]}
          size={[0.8, 0.07, 0.12]}
          color="#243d4b"
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
            className={`robot-label ${selected ? "robot-selected" : ""} ${session.requiresAttention ? "robot-attention" : ""} robot-${session.provider}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(session.key);
            }}
            aria-label={`Вибрати ${agentName(session.provider)} ${session.sessionId}`}
            aria-describedby={descriptionId}
          >
            <span id={descriptionId} className="sr-only">
              {session.project || "Проєкт невідомий"}. {STATUS_LABELS[status]}.
            </span>
            <PawPrint size={12} aria-hidden="true" />
            <span className={`robot-dot dot-${status}`} aria-hidden="true" />
            <WorkLabel session={session} />
            <span className="robot-tooltip">
              <strong>{agentName(session.provider)}</strong>
              <small>{session.sessionId}</small>
              <strong>{session.project}</strong>
              {session.parentSessionKey && (
                <small>Субагент: {session.parentSessionKey}</small>
              )}
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
