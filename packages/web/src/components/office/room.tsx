"use client";
import { OFFICE, WORK_ISLANDS } from "../../lib/office-space";
import { Box } from "./primitives";
import { Chair, Glass, Plant, Sofa } from "./furniture";

export function Room({ shadows }: { shadows: boolean }) {
  const back = -OFFICE.depth / 2;
  return (
    <group>
      {shadows && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.62, 0]}
          receiveShadow
        >
          <planeGeometry args={[200, 200]} />
          <meshLambertMaterial color="#e6e4df" />
        </mesh>
      )}
      {/* A shallow architectural plinth; the front and right sides stay open. */}
      <Box
        position={[0, -0.32, 0]}
        size={[OFFICE.width, 0.6, OFFICE.depth]}
        color="#d3ccbf"
        rounded
      />
      <Box position={[0, -0.02, 0]} size={[29.9, 0.06, 25.9]} color="#d6b98f" />
      {Array.from({ length: 30 }, (_, i) => (
        <group key={i}>
          <Box
            position={[-14.5 + i, 0.018, 0]}
            size={[0.985, 0.018, 25.8]}
            color={
              i % 3 === 0 ? "#d8bf9b" : i % 3 === 1 ? "#dfc8a6" : "#d4b58b"
            }
          />
          {[-8, 0, 8].map((z) => (
            <Box
              key={z}
              position={[-14.5 + i, 0.03, z + (i % 2) * 2]}
              size={[0.98, 0.006, 0.018]}
              color="#c5aa84"
            />
          ))}
        </group>
      ))}
      {/* Far-wall daylight windows never hide working seats. */}
      <Box
        position={[0, 0.52, back + 0.1]}
        size={[30, 1.04, 0.22]}
        color="#f0eee6"
      />
      <Box
        position={[0, 4.48, back + 0.1]}
        size={[30, 0.24, 0.28]}
        color="#f0eee6"
      />
      {[-12, -6, 0, 6, 12].map((x) => (
        <group key={x}>
          <Box
            position={[x, 2.72, back + 0.12]}
            size={[5.65, 3.25, 0.08]}
            color="#c8e2e5"
            emissive="#c8e2e5"
          />
          <Box
            position={[x, 1.8, back + 0.17]}
            size={[5.6, 1.35, 0.02]}
            color="#b8d2d2"
          />
          <Box
            position={[x, 2.7, back + 0.24]}
            size={[0.065, 3.3, 0.1]}
            color="#8e9e9b"
          />
          <Box
            position={[x, 2.7, back + 0.24]}
            size={[5.8, 0.06, 0.1]}
            color="#8e9e9b"
          />
          <Box
            position={[x, 1.08, back + 0.28]}
            size={[5.85, 0.1, 0.46]}
            color="#e8e5db"
          />
        </group>
      ))}
      {[-14.9, -9, -3, 3, 9, 14.9].map((x) => (
        <Box
          key={x}
          position={[x, 2.72, back + 0.23]}
          size={[0.17, 3.4, 0.25]}
          color="#ebe9e0"
        />
      ))}
      <Box position={[-14.88, 2.3, 0]} size={[0.24, 4.6, 26]} color="#ebe9e0" />
      <Box
        position={[-14.7, 0.16, 0]}
        size={[0.09, 0.22, 25.8]}
        color="#d1c9ba"
      />
      <Box position={[-14.85, 4.5, 0]} size={[0.3, 0.2, 26]} color="#f4f1e9" />
      {/* Four quiet rugs define work islands, with broad circulation between. */}
      {WORK_ISLANDS.map(({ x, z, rows }, i) => (
        <group key={i}>
          <Box
            position={[x, 0.055, z - 0.1]}
            size={[6.65, 0.035, rows === 2 ? 6.35 : 3.55]}
            color={i % 2 ? "#c8cfbf" : "#c4cec9"}
            rounded
          />
          <Plant
            position={[x, 0.08, z + (rows === 2 ? 0 : 1.45)]}
            scale={0.85}
          />
        </group>
      ))}
      {/* The meeting room sits beyond the work aisles, in the far corner. */}
      <group position={[10.95, 0, -7.6]}>
        <Box
          position={[0, 0.065, 0]}
          size={[5.4, 0.06, 6.4]}
          color="#d3d5ca"
          rounded
        />
        <Glass position={[-2.65, 1.65, -0.55]} size={[0.055, 3.2, 5.3]} />
        <Glass position={[0.55, 1.65, 3.15]} size={[4.2, 3.2, 0.055]} />
        {[-2.65, 2.65].map((x) => (
          <Box
            key={x}
            position={[x, 1.7, 3.15]}
            size={[0.065, 3.3, 0.065]}
            color="#8b9991"
          />
        ))}
        <Box
          position={[-2.65, 3.33, -0.05]}
          size={[0.08, 0.08, 6.5]}
          color="#8b9991"
        />
        <Box
          position={[0, 3.33, 3.15]}
          size={[5.4, 0.08, 0.08]}
          color="#8b9991"
        />
        <Box
          position={[0, 1.08, 0]}
          size={[2.4, 0.14, 3.2]}
          color="#c8aa80"
          rounded
        />
        {[-0.85, 0.85].map((z) => (
          <Box
            key={z}
            position={[0, 0.55, z]}
            size={[0.18, 1.05, 0.18]}
            color="#68746c"
          />
        ))}
        {[-0.85, 0.85].flatMap((z) =>
          [-1, 1].map((side) => (
            <Chair
              key={`${z}:${side}`}
              position={[side * 1.65, 0.1, z]}
              rotation={(side * Math.PI) / 2}
              color="#82958b"
            />
          )),
        )}
        <Box
          position={[0, 1.18, 0]}
          size={[0.7, 0.04, 1]}
          color="#e7e5d9"
          rounded
        />
      </group>
      {/* Lounge and coffee storage follow the wall, keeping the center open. */}
      <group position={[-11.45, 0, 5.4]}>
        <Box
          position={[0, 0.055, 0]}
          size={[5.1, 0.04, 6.3]}
          color="#e1d8c6"
          rounded
        />
        <Sofa position={[-1, 0.05, 0]} rotation={Math.PI / 2} />
        <Box
          position={[0.85, 0.55, 0]}
          size={[1.5, 0.12, 2.4]}
          color="#e9dfcb"
          rounded
        />
        <Box
          position={[0.85, 0.29, 0]}
          size={[0.7, 0.5, 1.3]}
          color="#bca586"
          rounded
        />
        <Box
          position={[0.9, 0.64, 0.3]}
          size={[0.7, 0.04, 0.85]}
          color="#9aa99a"
        />
      </group>
      <group position={[-13.6, 0, -6]}>
        <Box
          position={[0, 0.6, 0]}
          size={[1.45, 1.15, 4.7]}
          color="#c8b18d"
          rounded
        />
        <Box
          position={[0, 1.22, 0]}
          size={[1.55, 0.12, 4.85]}
          color="#ece6d8"
          rounded
        />
        {[-1.5, 0, 1.5].map((z) => (
          <Box
            key={z}
            position={[0.74, 0.68, z]}
            size={[0.025, 0.035, 0.55]}
            color="#81877a"
          />
        ))}
        <Box
          position={[0, 1.62, -1.1]}
          size={[0.8, 0.7, 0.85]}
          color="#626d65"
          rounded
        />
        <Box
          position={[0.42, 1.72, -1.1]}
          size={[0.025, 0.24, 0.48]}
          color="#d6ded2"
        />
      </group>
      {/* Restrained wall art and a few plants complete the daylight interior. */}
      {[-3, 1].map((z, i) => (
        <group key={z}>
          <Box
            position={[-14.68, 2.75, z]}
            size={[0.08, 1.9, 2.5]}
            color="#bca88a"
          />
          <Box
            position={[-14.62, 2.75, z]}
            size={[0.025, 1.7, 2.3]}
            color="#f0e9dc"
          />
          <Box
            position={[-14.59, 2.65, z - 0.25]}
            size={[0.02, 0.95, 1.1]}
            color={i ? "#a2b5a1" : "#cfa88b"}
            rounded
          />
        </group>
      ))}
      <Plant position={[-11, 0.05, -11.2]} scale={1.8} />
      <Plant position={[13.2, 0.05, 8.5]} scale={1.8} />
      <Plant position={[-12.3, 0.05, 10.5]} scale={1.6} />
      <Plant position={[1, 0.05, -11.3]} scale={1.5} />
    </group>
  );
}
