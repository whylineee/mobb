"use client";
import { Box, Foliage, Pot, type Seat } from "./primitives";
export function Plant({
  position,
  scale = 1,
}: {
  position: Seat;
  scale?: number;
}) {
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

export function Chair({
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

export function Glass({ position, size }: { position: Seat; size: Seat }) {
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

export function Sofa({
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
