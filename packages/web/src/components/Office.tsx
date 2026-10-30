"use client";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { BoxGeometry } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Focus, Minus, Plus } from "lucide-react";
import type { Session } from "@agentwatch/shared";
import { MascotInstances } from "./AgentMascot";
import { SceneFrames } from "./SceneFrames";
import { sameSceneSessions } from "../lib/scene-sessions";
import { officeLayout } from "../lib/office-layout";
import { OFFICE_SEATS } from "../lib/office-space";
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
    const pointer = useRef({ x: 0, y: 0, dragged: false });
    const previousSeats = useRef<ReadonlyMap<string, Seat>>(new Map());
    const { seats, zones, links, overflow } = useMemo(
      () => officeLayout(props.sessions, previousSeats.current),
      [props.sessions],
    );
    useLayoutEffect(() => {
      previousSeats.current = seats;
    }, [seats]);
    const occupied = new Map(
      props.sessions.flatMap((s) => {
        const seat = seats.get(s.key);
        return seat ? [[seat, s] as const] : [];
      }),
    );
    const furniture = OFFICE_SEATS.map((seat) => ({
      seat,
      session: occupied.get(seat),
    }));
    const setCamera = (type: string) =>
      setAction((a) => ({ type, id: a.id + 1 }));
    return (
      <SceneBoundary onFallback={props.onFallback}>
        <div
          className={`office-canvas ${props.sessions.length > 8 ? "office-dense" : ""}`}
          data-testid="office-canvas"
          data-seat-count={OFFICE_SEATS.length}
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
            <color attach="background" args={["#e6e4df"]} />
            <hemisphereLight args={["#fff8e9", "#a3ae9d", 1.8]} />
            <ambientLight intensity={0.5} color="#fff6e7" />
            <directionalLight
              position={[2, 18, -10]}
              intensity={2.3}
              color="#fff1d8"
              castShadow={shadows}
              shadow-mapSize={[1024, 1024]}
              shadow-camera-left={-23}
              shadow-camera-right={23}
              shadow-camera-top={23}
              shadow-camera-bottom={-23}
              shadow-radius={3}
              shadow-bias={-0.001}
            />
            <directionalLight
              position={[-8, 8, -6]}
              intensity={0.6}
              color="#d7e6ef"
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
                          <Room shadows={shadows} />
                          {zones.map((zone) => (
                            <Html
                              key={zone.key}
                              portal={portal as RefObject<HTMLElement>}
                              position={[
                                zone.seat[0],
                                0.15,
                                zone.seat[2] - 1.5,
                              ]}
                              center
                            >
                              <span className="office-project-zone">
                                {zone.project || "Проєкт невідомий"}
                              </span>
                            </Html>
                          ))}
                          {links.map((link) => (
                            <Line
                              key={link.key}
                              points={[
                                [link.parent[0], 0.12, link.parent[2]],
                                [link.child[0], 0.12, link.child[2]],
                              ]}
                              color="#587b69"
                              lineWidth={2}
                            />
                          ))}
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
                props.selectedKey ? seats.get(props.selectedKey) : undefined
              }
              action={action}
              reduced={props.reducedMotion}
              insets={props.insets}
              resetId={props.resetId}
            />
            <SceneFrames onLowFps={lowerQuality} animated={animated} />
          </Canvas>
        </div>
        {overflow > 0 && (
          <p className="office-capacity" role="status">
            У 3D-офісі {seats.size} із {props.sessions.length} агентів. Ще{" "}
            {overflow} — у списку «Агенти» та на таскборді.
          </p>
        )}
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
    sameSceneSessions(previous.allSessions, next.allSessions),
);

export default Office;
