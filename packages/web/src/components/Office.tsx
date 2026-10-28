"use client";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { BoxGeometry } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Focus, Minus, Plus } from "lucide-react";
import type { Session } from "@agentwatch/shared";
import { MascotInstances } from "./AgentMascot";
import { SceneFrames } from "./SceneFrames";
import { sameSceneSessions } from "../lib/scene-sessions";
import { HOME, type SceneInsets } from "../lib/office-camera";
import {
  SolidInstances,
  SoftInstances,
  GlowInstances,
  FoliageInstances,
  PotInstances,
  type Seat,
} from "./office/primitives";
import { SceneBoundary } from "./office/boundary";
import { Room } from "./office/room";
import { Desk } from "./office/desk";
import { CameraRig } from "./office/camera";

type Props = {
  sessions: Session[];
  allSessions: Session[];
  selectedKey: string | null;
  labels: boolean;
  reducedMotion: boolean;
  online: boolean;
  onSelect: (key: string | null) => void;
  onFallback: () => void;
  insets: SceneInsets;
  resetId: number;
};

const Office = memo(
  function Office(props: Props) {
    const [action, setAction] = useState({ type: "reset", id: 0 });
    const portal = useRef<HTMLDivElement>(null);
    const [detailed, setDetailed] = useState(true);
    const [pageVisible, setPageVisible] = useState(() => !document.hidden);
    useEffect(() => {
      const update = () => setPageVisible(!document.hidden);
      document.addEventListener("visibilitychange", update);
      return () => document.removeEventListener("visibilitychange", update);
    }, []);
    const animated =
      pageVisible &&
      props.online &&
      !props.reducedMotion &&
      props.sessions.some((session) => session.activity === "working");
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
            frameloop={pageVisible ? "demand" : "never"}
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
                        <MascotInstances shadows={shadows}>
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
                        </MascotInstances>
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
            <SceneFrames onLowFps={lowerQuality} animated={animated} />
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
  },
  (previous, next) =>
    previous.selectedKey === next.selectedKey &&
    previous.labels === next.labels &&
    previous.reducedMotion === next.reducedMotion &&
    previous.online === next.online &&
    previous.insets === next.insets &&
    previous.resetId === next.resetId &&
    previous.onSelect === next.onSelect &&
    previous.onFallback === next.onFallback &&
    sameSceneSessions(previous.sessions, next.sessions) &&
    previous.allSessions.length === next.allSessions.length &&
    previous.allSessions.every(
      (session, index) => session.key === next.allSessions[index]!.key,
    ),
);

export default Office;
