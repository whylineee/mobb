"use client";
import {
  Component,
  Suspense,
  memo,
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Html,
  createInstances,
  OrbitControls,
  RoundedBox,
} from "@react-three/drei";
import { BoxGeometry, Group, Vector3, MOUSE, TOUCH } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Bot, Focus, Minus, Plus } from "lucide-react";
import { sessionStatus, type Session } from "@agentwatch/shared";
import { agentName, STATUS_LABELS } from "./Status";
import {
  HOME,
  CAMERA_OFFSET,
  officeCameraLayout,
  clampOfficeCenter,
  type SceneInsets,
} from "../lib/office-camera";

type Props = {
  sessions: Session[];
  allSessions: Session[];
  selectedKey: string | null;
  labels: boolean;
  reducedMotion: boolean;
  onSelect: (key: string | null) => void;
  onFallback: () => void;
  insets: SceneInsets;
  resetId: number;
};
type Seat = [number, number, number];
type Controls = { target: Vector3; update: () => void };
const [SolidInstances, Solid] = createInstances();
const [GlowInstances, Glow] = createInstances();
const [SoftInstances, Soft] = createInstances();
const [FoliageInstances, Foliage] = createInstances();
const [PotInstances, Pot] = createInstances();
const [OrbInstances, Orb] = createInstances();
const [HeadInstances, Head] = createInstances();
const RobotParts = createContext(false);
declare global {
  interface Window {
    __agentwatchPerformance?: {
      fps: number;
      frames: number;
      calls: number;
      triangles: number;
      dpr: number;
    };
  }
}

class SceneBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch() {
    this.props.onFallback();
  }
  render() {
    return this.state.error ? (
      <div className="scene-loading">
        3D недоступне. Відкриваємо список сесій…
      </div>
    ) : (
      this.props.children
    );
  }
}

function Box({
  position,
  size,
  color,
  rounded = false,
  ...props
}: {
  position: Seat;
  size: Seat;
  color: string;
  rounded?: boolean;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}) {
  const animated = useContext(RobotParts);
  return animated ? (
    <Head position={position} scale={size} color={color} />
  ) : props.emissive ? (
    <Glow position={position} scale={size} color={color} />
  ) : rounded ? (
    <Soft position={position} scale={size} color={color} />
  ) : (
    <Solid position={position} scale={size} color={color} />
  );
}

function Plant({ position, scale = 1 }: { position: Seat; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <Pot position={[0, 0.25, 0]} color="#d3bd9c" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Foliage
          key={i}
          position={[
            Math.sin(i * 2.4) * 0.18,
            0.65 + (i % 2) * 0.18,
            Math.cos(i * 2.4) * 0.18,
          ]}
          rotation={[i * 0.2, i * 2, -0.3 + i * 0.15]}
          color={i % 2 ? "#527d5c" : "#6d9270"}
        />
      ))}
    </group>
  );
}

function Chair({
  position,
  rotation = 0,
  color = "#657b6c",
}: {
  position: Seat;
  rotation?: number;
  color?: string;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box
        position={[0, 0.55, 0]}
        size={[0.78, 0.16, 0.75]}
        color={color}
        rounded
      />
      <Box
        position={[0, 0.99, 0.32]}
        size={[0.78, 0.78, 0.15]}
        color={color}
        rounded
      />
      <Box position={[0, 0.25, 0]} size={[0.1, 0.5, 0.1]} color="#364440" />
      <Box position={[0, 0.09, 0]} size={[0.8, 0.07, 0.13]} color="#364440" />
      <Box position={[0, 0.09, 0]} size={[0.13, 0.07, 0.8]} color="#364440" />
      {[-0.44, 0.44].map((x) => (
        <Box
          key={x}
          position={[x, 0.78, 0.08]}
          size={[0.09, 0.09, 0.48]}
          color="#364440"
        />
      ))}
    </group>
  );
}

function Glass({ position, size }: { position: Seat; size: Seat }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color="#bddbd0"
        transparent
        opacity={0.13}
        roughness={0.12}
        depthWrite={false}
      />
    </mesh>
  );
}

function Sofa({
  position,
  rotation = 0,
}: {
  position: Seat;
  rotation?: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box
        position={[0, 0.44, 0]}
        size={[3.4, 0.65, 1.25]}
        color="#6d8872"
        rounded
      />
      <Box
        position={[0, 0.99, -0.53]}
        size={[3.4, 1.05, 0.3]}
        color="#58715f"
        rounded
      />
      {[-1.53, 1.53].map((x) => (
        <Box
          key={x}
          position={[x, 0.8, 0]}
          size={[0.32, 0.72, 1.3]}
          color="#58715f"
          rounded
        />
      ))}
      {[-0.98, 0, 0.98].map((x) => (
        <Box
          key={x}
          position={[x, 0.81, 0.04]}
          size={[0.91, 0.2, 0.96]}
          color="#8a9d7d"
          rounded
        />
      ))}
      {[-1.2, 1.2].map((x) => (
        <group
          key={x}
          position={[x, 1.03, -0.22]}
          rotation={[0.15, 0, x > 0 ? -0.17 : 0.17]}
        >
          <Box
            position={[0, 0, 0]}
            size={[0.48, 0.45, 0.19]}
            color={x > 0 ? "#ceaa75" : "#c6c6a8"}
            rounded
          />
        </group>
      ))}
      {[-1.25, 1.25].flatMap((x) =>
        [-0.4, 0.4].map((z) => (
          <Box
            key={`${x}:${z}`}
            position={[x, 0.12, z]}
            size={[0.1, 0.24, 0.1]}
            color="#364440"
          />
        )),
      )}
    </group>
  );
}

function Room({ rows, shadows }: { rows: number; shadows: boolean }) {
  const depth = Math.max(20, rows * 3.25 + 3);
  const back = -depth / 2;
  return (
    <group>
      {shadows && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.64, 0]}
          receiveShadow
        >
          <planeGeometry args={[200, 200]} />
          <meshLambertMaterial color="#65766c" />
        </mesh>
      )}
      <RoundedBox
        args={[26, 0.6, depth]}
        radius={0.14}
        smoothness={2}
        position={[0, -0.32, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#b1b4a2" roughness={0.9} />
      </RoundedBox>
      <Box
        position={[0, 0.015, 0]}
        size={[25.7, 0.05, depth - 0.3]}
        color="#c5aa82"
      />
      {Array.from({ length: Math.ceil(depth / 0.65) }, (_, i) => (
        <group key={i}>
          <Box
            position={[0, 0.045, back + 0.33 + i * 0.65]}
            size={[25.6, 0.008, 0.018]}
            color="#ac9472"
          />
          {[-8, -1.5, 5, 11.5].map((x) => (
            <Box
              key={x}
              position={[x + (i % 2 ? 1.6 : 0), 0.047, back + 0.65 + i * 0.65]}
              size={[0.015, 0.008, 0.62]}
              color="#b29a77"
            />
          ))}
        </group>
      ))}
      {/* Two full-height walls leave the front of the room open to the camera. */}
      <Box
        position={[0, 1.9, back + 0.12]}
        size={[26, 3.8, 0.24]}
        color="#d5d8c9"
      />
      <Box
        position={[-12.88, 1.9, 0]}
        size={[0.24, 3.8, depth]}
        color="#abb9a7"
      />
      <Box
        position={[0, 0.18, back + 0.28]}
        size={[25.7, 0.25, 0.09]}
        color="#768476"
      />
      <Box
        position={[-12.7, 0.18, 0]}
        size={[0.08, 0.25, depth - 0.3]}
        color="#768476"
      />
      <Box
        position={[0, 3.82, back + 0.12]}
        size={[26, 0.1, 0.32]}
        color="#e0dfcd"
      />
      <Box
        position={[-12.88, 3.82, 0]}
        size={[0.32, 0.1, depth]}
        color="#c4cbb7"
      />
      {[-8.8, -2.9, 3, 8.9].map((x) => (
        <group key={x} position={[x, 2.25, back + 0.3]}>
          <Box position={[0, 0, 0]} size={[4.7, 2.25, 0.16]} color="#455b53" />
          <Box
            position={[0, 0, 0.1]}
            size={[4.44, 2.01, 0.035]}
            color="#b5cfc0"
            emissive="#b4d2c4"
            emissiveIntensity={0.3}
            roughness={0.35}
          />
          {[-0.78, 0.78].map((dx) => (
            <Box
              key={dx}
              position={[dx, 0, 0.15]}
              size={[0.07, 2.1, 0.06]}
              color="#455b53"
            />
          ))}
          <Box
            position={[0, -0.2, 0.15]}
            size={[4.5, 0.06, 0.06]}
            color="#455b53"
          />
          <Box
            position={[0, -1.18, 0.13]}
            size={[4.9, 0.11, 0.47]}
            color="#dcd9bd"
          />
        </group>
      ))}
      {/* Woven carpet anchors the work area. */}
      <Box
        position={[-0.2, 0.065, 0.35]}
        size={[14.4, 0.04, depth - 3]}
        color="#899681"
        rounded
      />
      <Box
        position={[-0.2, 0.09, 0.35]}
        size={[14, 0.012, depth - 3.4]}
        color="#96a08a"
      />
      {[-6.9, 6.5].map((x) => (
        <Box
          key={x}
          position={[x, 0.1, 0.35]}
          size={[0.04, 0.01, depth - 3.5]}
          color="#b0b59c"
        />
      ))}
      {/* Glass meeting room on the right, with a door-sized opening. */}
      <group position={[9.6, 0, back + 4.4]}>
        <Box position={[0, 0.07, 0]} size={[5.5, 0.04, 6.6]} color="#758b80" />
        <Glass position={[-2.7, 1.6, -0.8]} size={[0.055, 3.2, 4.9]} />
        <Glass position={[0, 1.6, 3.25]} size={[5.4, 3.2, 0.055]} />
        {[-3.2, -0.8, 1.6].map((z) => (
          <Box
            key={z}
            position={[-2.7, 1.6, z]}
            size={[0.065, 3.2, 0.065]}
            color="#495e54"
          />
        ))}
        {[-2.7, 0, 2.7].map((x) => (
          <Box
            key={x}
            position={[x, 1.6, 3.25]}
            size={[0.065, 3.2, 0.065]}
            color="#495e54"
          />
        ))}
        <Box
          position={[-2.7, 3.22, -0.8]}
          size={[0.09, 0.09, 4.95]}
          color="#495e54"
        />
        <Box
          position={[0, 3.22, 3.25]}
          size={[5.5, 0.09, 0.09]}
          color="#495e54"
        />
        <Box
          position={[0, 1.15, 0]}
          size={[2.25, 0.18, 3.9]}
          color="#d6c3a0"
          rounded
        />
        {[-1.25, 1.25].map((z) => (
          <Box
            key={z}
            position={[0, 0.55, z]}
            size={[1.4, 1.1, 0.15]}
            color="#475a4d"
          />
        ))}
        {[-1.15, 1.15].flatMap((z) =>
          [-1, 1].map((side) => (
            <Chair
              key={`${z}:${side}`}
              position={[side * 1.75, 0, z]}
              rotation={(side * Math.PI) / 2}
              color="#596e67"
            />
          )),
        )}
        <Box
          position={[0, 1.26, -0.2]}
          size={[0.75, 0.04, 0.52]}
          color="#526c65"
          rounded
        />
        <Box
          position={[0.5, 1.29, 0.8]}
          size={[0.28, 0.1, 0.36]}
          color="#d1aa73"
        />
        <Plant position={[1.95, 0.08, -2.4]} scale={1.3} />
      </group>
      {/* Kitchenette and open shelves on the left. */}
      <group position={[-10.1, 0, back + 2.4]}>
        <Box position={[0, 0.63, 0]} size={[4.2, 1.25, 1.55]} color="#607c6a" />
        {[-1.4, 0, 1.4].map((x) => (
          <group key={x}>
            <Box
              position={[x, 0.63, 0.79]}
              size={[1.33, 1.12, 0.05]}
              color="#80917a"
            />
            <Box
              position={[x, 0.94, 0.84]}
              size={[0.32, 0.04, 0.06]}
              color="#c5c6ad"
            />
          </group>
        ))}
        <Box position={[0, 1.3, 0]} size={[4.35, 0.14, 1.65]} color="#d8ceb0" />
        <Box
          position={[-0.95, 1.69, -0.18]}
          size={[0.8, 0.67, 0.65]}
          color="#35463f"
          rounded
        />
        <Box
          position={[-0.95, 1.78, 0.16]}
          size={[0.55, 0.3, 0.025]}
          color="#94b09c"
          emissive="#94b09c"
          emissiveIntensity={0.3}
        />
        <Box
          position={[-0.95, 1.4, 0.35]}
          size={[0.68, 0.07, 0.4]}
          color="#55655a"
        />
        <Box
          position={[-0.95, 1.53, 0.29]}
          size={[0.18, 0.2, 0.18]}
          color="#d7c2a0"
          rounded
        />
        <Box
          position={[0.8, 1.39, 0]}
          size={[1.2, 0.05, 0.85]}
          color="#89998a"
          rounded
        />
        <Box
          position={[0.8, 1.69, -0.28]}
          size={[0.06, 0.58, 0.06]}
          color="#53675b"
        />
        <Box
          position={[0.8, 1.97, -0.1]}
          size={[0.06, 0.06, 0.42]}
          color="#53675b"
        />
        <Box
          position={[0, 2.7, -0.63]}
          size={[4.5, 0.12, 0.75]}
          color="#a88d66"
        />
        {[-1.8, -1.55, -1.3, 0.7, 0.95].map((x, i) => (
          <Box
            key={x}
            position={[x, 2.99, -0.55]}
            size={[0.17, 0.48 + (i % 2) * 0.13, 0.38]}
            color={["#8e9f8c", "#beaa80", "#6d8580"][i % 3]}
          />
        ))}
        <Plant position={[1.6, 2.76, -0.5]} scale={0.45} />
      </group>
      {/* A lived-in lounge, separate from the working floor. */}
      <group position={[-9.8, 0, 4.7]}>
        <Box
          position={[0, 0.07, 0.9]}
          size={[5.2, 0.035, 6.3]}
          color="#b7b79c"
          rounded
        />
        <Sofa position={[-1.25, 0, 0.6]} rotation={Math.PI / 2} />
        <Sofa position={[0.2, 0, -1.8]} />
        <RoundedBox
          args={[1.8, 0.15, 2.3]}
          radius={0.24}
          smoothness={3}
          position={[0.6, 0.64, 0.65]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#bb9a6d" roughness={0.7} />
        </RoundedBox>
        <Box
          position={[0.6, 0.33, 0.65]}
          size={[0.8, 0.6, 1.25]}
          color="#8c7759"
        />
        <Box
          position={[0.45, 0.75, 0.45]}
          size={[0.65, 0.06, 0.8]}
          color="#e0d8b8"
        />
        <Box
          position={[0.55, 0.81, 0.37]}
          size={[0.57, 0.05, 0.65]}
          color="#658378"
        />
        <Plant position={[1.7, 0.08, 3.1]} scale={1.25} />
      </group>
      {/* Slatted sideboard and a reading corner. */}
      <group position={[9.6, 0, 5.5]}>
        <Box position={[0, 0.6, 2.6]} size={[4.7, 1.15, 1.1]} color="#a78b63" />
        {Array.from({ length: 24 }, (_, i) => (
          <Box
            key={i}
            position={[-2.2 + i * 0.19, 0.6, 3.18]}
            size={[0.07, 1.06, 0.08]}
            color="#c1a276"
          />
        ))}
        <Box
          position={[0, 1.23, 2.6]}
          size={[4.85, 0.13, 1.2]}
          color="#ddc8a1"
        />
        <Plant position={[1.5, 1.3, 2.6]} scale={0.65} />
        <Box
          position={[-1, 1.39, 2.6]}
          size={[0.9, 0.2, 0.55]}
          color="#d6c8a7"
        />
        <Box
          position={[-1.05, 1.53, 2.6]}
          size={[0.8, 0.07, 0.5]}
          color="#607f74"
        />
        <Chair position={[-0.9, 0, -0.2]} rotation={-0.4} color="#bb9f75" />
        <Chair position={[1.05, 0, -0.2]} rotation={0.4} color="#bb9f75" />
        <Box
          position={[0, 0.55, -1.8]}
          size={[1.4, 0.12, 1.2]}
          color="#c7b18b"
          rounded
        />
        <Box
          position={[0, 0.28, -1.8]}
          size={[0.12, 0.55, 0.12]}
          color="#53665a"
        />
      </group>
      <Plant position={[-11.8, 0.05, back + 5]} scale={1.5} />
      <Plant position={[11.6, 0.05, 1.8]} scale={1.65} />
      <Plant position={[-11.8, 0.05, -0.3]} scale={1.4} />
      {/* Wall-mounted cantilevers support the lights without hiding the floor. */}
      {[-4.3, 2.5].map((x) => (
        <group key={x}>
          {[-0.32, 0.32].map((dx) => (
            <group key={dx}>
              <Box
                position={[x + dx, 3.48, back + 0.25]}
                size={[0.18, 0.55, 0.22]}
                color="#53635a"
              />
              <Box
                position={[x + dx, 3.7, (back + 1) / 2]}
                size={[0.08, 0.12, 1 - back]}
                color="#53635a"
              />
            </group>
          ))}
          {[-5, 1].map((z) => (
            <Box
              key={`crossbar-${z}`}
              position={[x, 3.7, z]}
              size={[0.75, 0.12, 0.1]}
              color="#53635a"
            />
          ))}
          {[-5, 1].map((z) => (
            <Box
              key={z}
              position={[x, 3.53, z]}
              size={[0.025, 0.34, 0.025]}
              color="#53635a"
            />
          ))}
          <Box
            position={[x, 3.35, -2]}
            size={[0.22, 0.16, 7]}
            color="#46594f"
            rounded
          />
          <Box
            position={[x, 3.255, -2]}
            size={[0.16, 0.035, 6.8]}
            color="#eee6bd"
            emissive="#eee6bd"
            emissiveIntensity={0.65}
          />
        </group>
      ))}
    </group>
  );
}

const Robot = memo(function Robot({
  session,
  reducedMotion,
}: {
  session: Session;
  reducedMotion: boolean;
}) {
  const body = useRef<Group>(null),
    left = useRef<Group>(null),
    right = useRef<Group>(null);
  const status = sessionStatus(session),
    codex = session.provider === "codex";
  const shell = codex ? "#c3d5c5" : "#d7b6a0",
    accent = codex ? "#72c6ad" : "#dc9b77";
  const light =
    status === "working"
      ? "#83ddad"
      : status === "waiting"
        ? "#efbd69"
        : status === "ended"
          ? "#66766d"
          : "#b4c2b6";
  useFrame(({ clock }) => {
    if (!body.current || !left.current || !right.current) return;
    const t = clock.elapsedTime;
    body.current.position.y =
      reducedMotion || status === "unknown"
        ? 0
        : Math.sin(t * (status === "working" ? 5 : 1.4)) * 0.012;
    left.current.rotation.x =
      status === "working" && !reducedMotion
        ? -0.6 + Math.sin(t * 12) * 0.12
        : -0.25;
    right.current.rotation.z = status === "waiting" ? -2.6 : 0;
    right.current.rotation.x =
      status === "working" && !reducedMotion
        ? -0.6 + Math.sin(t * 12 + 2) * 0.12
        : -0.25;
    if (status === "ended" && session.endedAt) {
      const elapsed = Date.now() - session.endedAt;
      body.current.position.y = 0.12;
      body.current.scale.setScalar(
        elapsed > 55000 ? Math.max(0.03, 1 - (elapsed - 55000) / 5000) : 1,
      );
    } else body.current.scale.setScalar(1);
  });
  return (
    <RobotParts.Provider value={true}>
      <group ref={body} position={[0, 0, 0]}>
        <Box
          position={[-0.19, 0.32, 0.11]}
          size={[0.23, 0.43, 0.3]}
          color="#4b6059"
          rounded
        />
        <Box
          position={[0.19, 0.32, 0.11]}
          size={[0.23, 0.43, 0.3]}
          color="#4b6059"
          rounded
        />
        <Box
          position={[0, 0.7, 0]}
          size={[0.67, 0.65, 0.45]}
          color={shell}
          rounded
        />
        <Box
          position={[0, 0.78, 0.24]}
          size={[0.32, 0.25, 0.04]}
          color={accent}
          rounded
        />
        <Head position={[0, 1.34, 0]} scale={[0.88, 0.7, 0.62]} color={shell} />
        <Box
          position={[0, 1.34, 0.325]}
          size={[0.66, 0.31, 0.03]}
          color="#263d37"
          rounded
        />
        {[-0.17, 0.17].map((x) => (
          <Orb key={x} position={[x, 1.36, 0.35]} scale={0.058} color={light} />
        ))}
        <Box
          position={[0, 1.65, 0]}
          size={[0.045, 0.25, 0.045]}
          color="#526b5e"
        />
        <Orb position={[0, 1.82, 0]} scale={0.065} color={accent} />
        <group ref={left} position={[-0.43, 0.88, 0]}>
          <Box
            position={[0, -0.22, 0.08]}
            size={[0.2, 0.45, 0.22]}
            color={shell}
            rounded
          />
        </group>
        <group ref={right} position={[0.43, 0.88, 0]}>
          <Box
            position={[0, -0.22, 0.08]}
            size={[0.2, 0.45, 0.22]}
            color={shell}
            rounded
          />
        </group>
        {!codex && (
          <>
            <Box
              position={[-0.45, 1.35, 0]}
              size={[0.12, 0.25, 0.2]}
              color={accent}
            />
            <Box
              position={[0.45, 1.35, 0]}
              size={[0.12, 0.25, 0.2]}
              color={accent}
            />
          </>
        )}
      </group>
    </RobotParts.Provider>
  );
});

const Desk = memo(function Desk({
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
  onSelect: Props["onSelect"];
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
      <Box position={[0, 0.22, 0.95]} size={[0.1, 0.5, 0.1]} color="#3e5348" />
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
      {session && (
        <group position={[0, 0.6, 0.7]} scale={0.8}>
          <Robot session={session} reducedMotion={reducedMotion} />
        </group>
      )}
      {session && (labels || selected || hovered) && (
        <Html
          portal={portal as RefObject<HTMLElement>}
          center
          position={[0, 2.65, 0]}
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
            <Bot size={12} aria-hidden="true" />
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

function CameraRig({
  focus,
  action,
  reduced,
  rows,
  insets,
  resetId,
}: {
  focus: Seat | undefined;
  action: { type: string; id: number };
  reduced: boolean;
  rows: number;
  insets: SceneInsets;
  resetId: number;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<Controls | null>(null);
  const layout = useMemo(
    () => officeCameraLayout(size.width, size.height, rows, insets),
    [
      size.width,
      size.height,
      rows,
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
        clampOfficeCenter(center, camera.zoom, layout.baseZoom, layout.depth),
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
      layout.depth,
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

function PerformanceMeter({
  onLowFps,
  continuous,
}: {
  onLowFps: () => void;
  continuous: boolean;
}) {
  const stats = useRef({ start: 0, count: 0, frames: 0, slowSamples: 0 });
  useFrame(({ gl }) => {
    const now = performance.now(),
      s = stats.current;
    s.frames++;
    s.count++;
    window.__agentwatchPerformance = {
      fps: window.__agentwatchPerformance?.fps ?? 0,
      frames: s.frames,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      dpr: gl.getPixelRatio(),
    };
    // Demand rendering intentionally pauses. Idle time is not a slow frame.
    if (!continuous) return;
    if (!s.start) s.start = now;
    if (now - s.start > 1000) {
      const fps = Math.round((s.count * 1000) / (now - s.start));
      window.__agentwatchPerformance = {
        fps,
        frames: s.frames,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        dpr: gl.getPixelRatio(),
      };
      s.slowSamples = fps < 32 ? s.slowSamples + 1 : 0;
      if (s.slowSamples >= 2) {
        onLowFps();
        s.slowSamples = 0;
      }
      s.count = 0;
      s.start = now;
    }
  });
  return null;
}

export default function Office(props: Props) {
  const [action, setAction] = useState({ type: "reset", id: 0 });
  const portal = useRef<HTMLDivElement>(null);
  const [detailed, setDetailed] = useState(true);
  // Preserve native pixel density. Reduce mesh detail and shadows under load.
  const lowerQuality = useCallback(() => setDetailed(false), []);
  const shadows = props.sessions.length <= 8 && detailed;
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const softGeometry = useMemo(
    () => new RoundedBoxGeometry(1, 1, 1, 1, 0.06),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      softGeometry.dispose();
    },
    [geometry, softGeometry],
  );
  const seats = useRef(new Map<string, Seat>()),
    pointer = useRef({ x: 0, y: 0, dragged: false });
  const allKeys = props.allSessions.map((s) => s.key).join("|");
  useMemo(() => {
    const keys = new Set(props.allSessions.map((s) => s.key));
    for (const key of seats.current.keys())
      if (!keys.has(key)) seats.current.delete(key);
    const taken = new Set(
      [...seats.current.values()].map((p) => `${p[0]}:${p[2]}`),
    );
    for (const session of props.allSessions) {
      if (seats.current.has(session.key)) continue;
      for (let i = 0; ; i++) {
        const seat: Seat = [
          -5.2 + (i % 4) * 3.4,
          0,
          -5.9 + Math.floor(i / 4) * 3.25,
        ];
        const key = `${seat[0]}:${seat[2]}`;
        if (!taken.has(key)) {
          seats.current.set(session.key, seat);
          taken.add(key);
          break;
        }
      }
    }
  }, [allKeys]);
  const occupied = new Map(
    props.sessions.map((s) => {
      const seat = seats.current.get(s.key) ?? [0, 0, 0];
      return [`${seat[0]}:${seat[2]}`, s] as const;
    }),
  );
  const maxRow = Math.max(
    4,
    ...[...seats.current.values()].map(
      (seat) => Math.round((seat[2] + 5.9) / 3.25) + 1,
    ),
  );
  const rows = Math.max(4, maxRow);
  const furniture = Array.from({ length: rows * 4 }, (_, i) => {
    const seat: Seat = [
      -5.2 + (i % 4) * 3.4,
      0,
      -5.9 + Math.floor(i / 4) * 3.25,
    ];
    return { seat, session: occupied.get(`${seat[0]}:${seat[2]}`) };
  });
  const setCamera = (type: string) =>
    setAction((a) => ({ type, id: a.id + 1 }));
  return (
    <SceneBoundary onFallback={props.onFallback}>
      <div
        className="office-canvas"
        data-testid="office-canvas"
        onPointerDown={(e) => {
          pointer.current = { x: e.clientX, y: e.clientY, dragged: false };
        }}
        onPointerMove={(e) => {
          if (
            Math.hypot(
              e.clientX - pointer.current.x,
              e.clientY - pointer.current.y,
            ) > 5
          )
            pointer.current.dragged = true;
        }}
      >
        <div className="robot-overlays" ref={portal} />
        <Canvas
          orthographic
          camera={{ position: HOME, zoom: 28, near: 0.1, far: 1000 }}
          dpr={[1, 2]}
          shadows={shadows}
          frameloop={props.reducedMotion ? "demand" : "always"}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
          onPointerMissed={() => {
            if (!pointer.current.dragged) props.onSelect(null);
          }}
        >
          <color attach="background" args={["#8c9a7b"]} />
          <hemisphereLight args={["#e4ecdf", "#8d826c", 2]} />
          <ambientLight intensity={0.45} color="#e5e8d9" />
          <directionalLight
            position={[3, 18, -5]}
            intensity={3.2}
            color="#ffdfb2"
            castShadow={shadows}
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-15}
            shadow-camera-right={15}
            shadow-camera-top={15}
            shadow-camera-bottom={-15}
            shadow-bias={-0.001}
          />
          <directionalLight
            position={[-8, 8, -6]}
            intensity={0.6}
            color="#a4d3c4"
          />
          <Suspense fallback={null}>
            <SolidInstances
              frames={1}
              limit={Math.max(2200, furniture.length * 45 + 800)}
              geometry={geometry}
              castShadow
              receiveShadow
            >
              <meshLambertMaterial color="white" />
              <SoftInstances
                frames={1}
                limit={Math.max(500, furniture.length * 15)}
                geometry={detailed ? softGeometry : geometry}
                castShadow
                receiveShadow
              >
                <meshLambertMaterial />
                <GlowInstances
                  frames={1}
                  limit={Math.max(200, furniture.length * 5)}
                >
                  <boxGeometry args={[1, 1, 1]} />
                  <meshBasicMaterial />
                  <FoliageInstances frames={1} limit={100} castShadow>
                    <sphereGeometry args={[0.24, 6, 5]} />
                    <meshLambertMaterial />
                    <PotInstances frames={1} limit={24} castShadow>
                      <cylinderGeometry args={[0.29, 0.23, 0.5, 8]} />
                      <meshLambertMaterial />
                      <OrbInstances limit={Math.max(100, furniture.length * 3)}>
                        <sphereGeometry args={[1, 8, 6]} />
                        <meshBasicMaterial />
                        <HeadInstances
                          limit={Math.max(100, furniture.length * 15)}
                          geometry={detailed ? softGeometry : geometry}
                          castShadow
                        >
                          <meshLambertMaterial />
                          <Room rows={rows} shadows={shadows} />
                          {furniture.map(({ seat, session }, i) => (
                            <Desk
                              key={i}
                              session={session}
                              seat={seat}
                              selected={
                                !!session && props.selectedKey === session.key
                              }
                              labels={props.labels}
                              reducedMotion={props.reducedMotion}
                              onSelect={props.onSelect}
                              portal={portal}
                            />
                          ))}
                        </HeadInstances>
                      </OrbInstances>
                    </PotInstances>
                  </FoliageInstances>
                </GlowInstances>
              </SoftInstances>
            </SolidInstances>
          </Suspense>
          <CameraRig
            focus={
              props.selectedKey
                ? seats.current.get(props.selectedKey)
                : undefined
            }
            action={action}
            reduced={props.reducedMotion}
            rows={rows}
            insets={props.insets}
            resetId={props.resetId}
          />
          <PerformanceMeter
            onLowFps={lowerQuality}
            continuous={!props.reducedMotion}
          />
        </Canvas>
      </div>
      <div className="camera-controls">
        <button
          aria-label="Наблизити"
          title="Наблизити"
          onClick={() => setCamera("in")}
        >
          <Plus size={16} />
        </button>
        <button
          aria-label="Віддалити"
          title="Віддалити"
          onClick={() => setCamera("out")}
        >
          <Minus size={16} />
        </button>
        <span />
        <button
          aria-label="Показати весь офіс"
          title="Показати весь офіс"
          onClick={() => setCamera("reset")}
        >
          <Focus size={16} />
        </button>
      </div>
    </SceneBoundary>
  );
}
