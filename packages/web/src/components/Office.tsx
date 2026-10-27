"use client";
import {
  Component,
  Suspense,
  memo,
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
  Instance,
  Instances,
  OrbitControls,
  RoundedBox,
} from "@react-three/drei";
import { Group, Mesh, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Bot, Focus, Minus, Plus } from "lucide-react";
import { sessionStatus, type Session } from "@agentwatch/shared";
import { agentName, STATUS_LABELS } from "./Status";

type Props = {
  sessions: Session[];
  allSessions: Session[];
  selectedKey: string | null;
  labels: boolean;
  reducedMotion: boolean;
  onSelect: (key: string | null) => void;
  onFallback: () => void;
};
type Seat = [number, number, number];
type Controls = { target: Vector3; update: () => void };
declare global {
  interface Window {
    __agentwatchPerformance?: { fps: number; frames: number; calls: number };
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
  return <Instance position={position} scale={size} color={color} />;
}
function Plant({ position, scale = 1 }: { position: Seat; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.29, 0.23, 0.5, 8]} />
        <meshStandardMaterial color="#d3bd9c" roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin(i * 2.4) * 0.18,
            0.65 + (i % 2) * 0.18,
            Math.cos(i * 2.4) * 0.18,
          ]}
          rotation={[i * 0.2, i * 2, -0.3 + i * 0.15]}
          castShadow
        >
          <sphereGeometry args={[0.24, 6, 5]} />
          <meshStandardMaterial
            color={i % 2 ? "#527d5c" : "#6d9270"}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  );
}

function Room() {
  return (
    <group>
      <RoundedBox
        args={[22, 0.55, 18]}
        radius={0.3}
        smoothness={2}
        position={[0, -0.3, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#a6a99a" roughness={0.95} />
      </RoundedBox>
      <Box position={[0, -0.02, 0]} size={[21.7, 0.06, 17.7]} color="#beb7a1" />
      {Array.from({ length: 17 }, (_, i) => (
        <Box
          key={i}
          position={[0, 0.016, -8 + i]}
          size={[21.6, 0.008, 0.018]}
          color="#afa892"
        />
      ))}
      <Box position={[0, 1.25, -8.8]} size={[22, 2.5, 0.25]} color="#6e8077" />
      <Box
        position={[-10.85, 1.25, 0]}
        size={[0.25, 2.5, 17.5]}
        color="#839087"
      />
      <Box position={[0, 2.52, -8.8]} size={[22, 0.12, 0.35]} color="#abb29e" />
      <Box
        position={[-10.85, 2.52, 0]}
        size={[0.35, 0.12, 17.6]}
        color="#abb29e"
      />
      {[-6.5, 0, 6.5].map((x) => (
        <group key={x} position={[x, 1.5, -8.6]}>
          <Box position={[0, 0, 0]} size={[3.8, 1.55, 0.12]} color="#3c514e" />
          <Box
            position={[0, 0, 0.09]}
            size={[3.5, 1.3, 0.04]}
            color="#9bb1a0"
            roughness={0.25}
            emissive="#668578"
            emissiveIntensity={0.15}
          />
          <Box
            position={[0, 0, 0.14]}
            size={[0.09, 1.4, 0.05]}
            color="#4f655d"
          />
          <Box
            position={[0, 0, 0.14]}
            size={[3.6, 0.08, 0.05]}
            color="#4f655d"
          />
        </group>
      ))}
      <Plant position={[-9.5, 0.02, -7]} scale={1.35} />
      <Plant position={[9.7, 0.02, -7]} scale={1.5} />
      <Plant position={[9.6, 0.02, 7]} scale={1.15} />
      <group position={[-9.25, 0, 4.7]}>
        <Box
          position={[0, 0.35, 0]}
          size={[1.7, 0.6, 3.3]}
          color="#5d7c71"
          rounded
        />
        <Box
          position={[-0.65, 0.95, 0]}
          size={[0.4, 1.1, 3.3]}
          color="#5b776d"
          rounded
        />
        <Box
          position={[0.05, 0.73, -1.35]}
          size={[1.5, 0.7, 0.45]}
          color="#678579"
          rounded
        />
        <Box
          position={[0.05, 0.73, 1.35]}
          size={[1.5, 0.7, 0.45]}
          color="#678579"
          rounded
        />
      </group>
      <group position={[-9.25, 0, 0.8]}>
        <Box
          position={[0, 0.65, 0]}
          size={[1.5, 1.3, 1.3]}
          color="#a79072"
          rounded
        />
        <Box position={[0, 1.35, 0]} size={[1.6, 0.12, 1.4]} color="#d5c2a2" />
        <Box
          position={[0, 1.68, 0]}
          size={[0.7, 0.6, 0.65]}
          color="#394a46"
          rounded
        />
        <Box
          position={[0, 1.74, 0.34]}
          size={[0.35, 0.25, 0.02]}
          color="#778b78"
          emissive="#8ba58e"
          emissiveIntensity={0.3}
        />
      </group>
      <Box
        position={[0, 0.025, 0.3]}
        size={[19, 0.025, 14.3]}
        color="#8c988b"
      />
      <Box position={[0, 0.04, 0.3]} size={[18.7, 0.02, 14]} color="#939f90" />
      <Plant position={[-9.5, 0.05, 7.4]} scale={1.1} />
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
    right = useRef<Group>(null),
    antenna = useRef<Mesh>(null);
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
      <RoundedBox
        args={[0.88, 0.7, 0.62]}
        radius={codex ? 0.16 : 0.1}
        smoothness={3}
        position={[0, 1.34, 0]}
        castShadow
      >
        <meshStandardMaterial color={shell} roughness={0.65} />
      </RoundedBox>
      <Box
        position={[0, 1.34, 0.325]}
        size={[0.66, 0.31, 0.03]}
        color="#263d37"
        rounded
      />
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} position={[x, 1.36, 0.35]}>
          <sphereGeometry args={[0.058, 8, 6]} />
          <meshStandardMaterial
            color={light}
            emissive={light}
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}
      <Box
        position={[0, 1.65, 0]}
        size={[0.045, 0.25, 0.045]}
        color="#526b5e"
      />
      <mesh ref={antenna} position={[0, 1.82, 0]}>
        <sphereGeometry args={[0.065, 8, 6]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={status === "working" ? 0.5 : 0.1}
        />
      </mesh>
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
  session: Session;
  seat: Seat;
  selected: boolean;
  labels: boolean;
  reducedMotion: boolean;
  onSelect: Props["onSelect"];
  portal: RefObject<HTMLDivElement | null>;
}) {
  const status = sessionStatus(session),
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
        onSelect(session.key);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
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
        color={session.provider === "codex" ? "#a6c1a6" : "#c59b74"}
        rounded
      />
      <Box
        position={[0, 0.55, 0.95]}
        size={[0.85, 0.15, 0.8]}
        color="#526b5d"
        rounded
      />
      <Box position={[0, 0.22, 0.95]} size={[0.1, 0.5, 0.1]} color="#3e5348" />
      <group position={[0, 0.6, 0.7]} scale={0.8}>
        <Robot session={session} reducedMotion={reducedMotion} />
      </group>
      {(labels || selected || hovered) && (
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
            <span className={`robot-dot dot-${status}`} />
            <span>
              {agentName(session.provider)}
              <small>
                {session.sessionId.length > 10
                  ? session.sessionId.slice(0, 4) +
                    "…" +
                    session.sessionId.slice(-4)
                  : session.sessionId}
              </small>
            </span>
            {status === "waiting" && <b>!</b>}
            {status === "unknown" && <b>?</b>}
            <span className="robot-tooltip">
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
}: {
  focus: Seat | undefined;
  action: { type: string; id: number };
  reduced: boolean;
}) {
  const { camera, size, invalidate } = useThree(),
    controls = useRef<Controls | null>(null);
  const goal = useRef<{ target: Vector3; zoom: number } | null>(null);
  const baseZoom = Math.min(size.width / 31, size.height / 20.5);
  useEffect(() => {
    goal.current = {
      target: focus
        ? new Vector3(focus[0], 0.8, focus[2])
        : new Vector3(0, 0, 0),
      zoom: focus ? baseZoom * 1.4 : baseZoom,
    };
    invalidate();
  }, [focus?.[0], focus?.[2], baseZoom, invalidate]);
  useEffect(() => {
    if (!action.id) return;
    if (action.type === "reset")
      goal.current = { target: new Vector3(0, 0, 0), zoom: baseZoom };
    else {
      camera.zoom *= action.type === "in" ? 1.2 : 1 / 1.2;
      camera.zoom = Math.max(
        baseZoom * 0.6,
        Math.min(baseZoom * 3, camera.zoom),
      );
      camera.updateProjectionMatrix();
      goal.current = null;
    }
    invalidate();
  }, [action, baseZoom, camera, invalidate]);
  useFrame((_, delta) => {
    if (!goal.current || !controls.current) return;
    const alpha = reduced ? 1 : 1 - Math.exp(-delta * 7),
      old = controls.current.target.clone();
    controls.current.target.lerp(goal.current.target, alpha);
    camera.position.add(controls.current.target.clone().sub(old));
    camera.zoom += (goal.current.zoom - camera.zoom) * alpha;
    camera.updateProjectionMatrix();
    controls.current.update();
    if (
      controls.current.target.distanceTo(goal.current.target) < 0.01 &&
      Math.abs(camera.zoom - goal.current.zoom) < 0.01
    )
      goal.current = null;
    else invalidate();
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
      enableDamping={!reduced}
      dampingFactor={0.12}
      minZoom={baseZoom * 0.6}
      maxZoom={baseZoom * 3}
      onStart={() => {
        goal.current = null;
      }}
    />
  );
}

function PerformanceMeter({ onLowFps }: { onLowFps: () => void }) {
  const stats = useRef({ start: 0, count: 0, frames: 0, slowSamples: 0 });
  useFrame(({ gl }) => {
    const now = performance.now(),
      s = stats.current;
    s.frames++;
    s.count++;
    if (!s.start) s.start = now;
    if (now - s.start > 1000) {
      const fps = Math.round((s.count * 1000) / (now - s.start));
      window.__agentwatchPerformance = {
        fps,
        frames: s.frames,
        calls: gl.info.render.calls,
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
  const [pixelRatio, setPixelRatio] = useState(1);
  const lowerQuality = useCallback(
    () => setPixelRatio((value) => Math.max(0.6, value * 0.8)),
    [],
  );
  const shadows = props.sessions.length <= 8 && pixelRatio >= 1;
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 1, 0.035), []);
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
          ((i % 5) - 2) * 3.5,
          0,
          (Math.floor(i / 5) - 1.5) * 3.45,
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
  const setCamera = (type: string) =>
    setAction((a) => ({ type, id: a.id + 1 }));
  return (
    <SceneBoundary onFallback={props.onFallback}>
      <div
        className="office-canvas"
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
          camera={{ position: [23, 27, 26], zoom: 28, near: 0.1, far: 150 }}
          dpr={pixelRatio}
          shadows={shadows}
          frameloop={props.reducedMotion ? "demand" : "always"}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          onPointerMissed={() => {
            if (!pointer.current.dragged) props.onSelect(null);
          }}
        >
          <color attach="background" args={["#202b2b"]} />
          <ambientLight intensity={1.5} color="#d5e1d5" />
          <directionalLight
            position={[4, 14, 7]}
            intensity={2.8}
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
            <Instances
              limit={1500}
              geometry={geometry}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color="white" roughness={0.85} />
              <Room />
              {props.sessions.map((s) => (
                <Desk
                  key={s.key}
                  session={s}
                  seat={seats.current.get(s.key) ?? [0, 0, 0]}
                  selected={props.selectedKey === s.key}
                  labels={props.labels}
                  reducedMotion={props.reducedMotion}
                  onSelect={props.onSelect}
                  portal={portal}
                />
              ))}
            </Instances>
          </Suspense>
          <CameraRig
            focus={
              props.selectedKey
                ? seats.current.get(props.selectedKey)
                : undefined
            }
            action={action}
            reduced={props.reducedMotion}
          />
          <PerformanceMeter onLowFps={lowerQuality} />
        </Canvas>
      </div>
      <div className="camera-controls">
        <button aria-label="Наблизити" onClick={() => setCamera("in")}>
          <Plus size={16} />
        </button>
        <button aria-label="Віддалити" onClick={() => setCamera("out")}>
          <Minus size={16} />
        </button>
        <span />
        <button
          aria-label="Показати весь офіс"
          onClick={() => setCamera("reset")}
        >
          <Focus size={16} />
        </button>
      </div>
      <div className="scene-caption">
        <span className="tiny-dot" />
        AGENTWATCH OFFICE <span>01</span>
      </div>
    </SceneBoundary>
  );
}
