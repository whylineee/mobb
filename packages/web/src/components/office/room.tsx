"use client";
import { RoundedBox } from "@react-three/drei";
import { Box } from "./primitives";
import { Chair, Glass } from "./furniture";

export function Room({ rows, shadows }: { rows: number; shadows: boolean }) {
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
          <meshLambertMaterial color="#111e2b" />
        </mesh>
      )}
      {/* Raised platform, with a central working deck and surrounding walkways. */}
      <RoundedBox
        args={[26, 0.6, depth]}
        radius={0.14}
        smoothness={2}
        position={[0, -0.32, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#293a49" roughness={0.82} />
      </RoundedBox>
      <Box
        position={[0, 0.01, 0]}
        size={[25.7, 0.05, depth - 0.3]}
        color="#243746"
      />
      <Box
        position={[0, 0.055, 0]}
        size={[14.5, 0.07, depth - 1.1]}
        color="#354c5b"
        rounded
      />
      {[-7.45, 7.45].map((x) => (
        <group key={x}>
          <Box
            position={[x, 0.065, 0]}
            size={[0.12, 0.05, depth - 0.6]}
            color="#142938"
          />
          <Box
            position={[x, 0.095, 0]}
            size={[0.035, 0.014, depth - 0.8]}
            color="#60d9e6"
            emissive="#60d9e6"
          />
        </group>
      ))}
      {Array.from({ length: Math.floor((depth - 1) / 2) }, (_, i) => (
        <Box
          key={i}
          position={[0, 0.095, back + 1 + i * 2]}
          size={[14.3, 0.008, 0.018]}
          color="#496371"
        />
      ))}

      {/* Two low structural walls keep the open isometric view unobstructed. */}
      <Box
        position={[0, 1.7, back + 0.12]}
        size={[26, 3.4, 0.24]}
        color="#253e50"
      />
      <Box
        position={[-12.88, 1.7, 0]}
        size={[0.24, 3.4, depth]}
        color="#1c3446"
      />
      <Box
        position={[0, 3.42, back + 0.12]}
        size={[26, 0.08, 0.3]}
        color="#7197a8"
      />
      <Box
        position={[-12.88, 3.42, 0]}
        size={[0.3, 0.08, depth]}
        color="#7197a8"
      />
      <Box
        position={[0, 3.27, back + 0.27]}
        size={[25.3, 0.035, 0.035]}
        color="#83f0f0"
        emissive="#83f0f0"
      />

      {/* Back-wall mission displays: graphic panels, not live telemetry. */}
      {[-4.8, 0, 4.8].map((x, index) => (
        <group key={x} position={[x, 1.95, back + 0.3]}>
          <Box
            position={[0, 0, 0]}
            size={[4.35, 2.25, 0.13]}
            color="#101f2c"
            rounded
          />
          <Box
            position={[0, 0, 0.08]}
            size={[4.12, 2.01, 0.025]}
            color="#183c50"
            emissive="#183c50"
          />
          <Box
            position={[-1.65, 0.68, 0.1]}
            size={[0.55, 0.045, 0.02]}
            color="#65e2e6"
            emissive="#65e2e6"
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <Box
              key={i}
              position={[
                -1.55 + i * 0.77,
                -0.4 + ((i + index) % 3) * 0.13,
                0.1,
              ]}
              size={[0.45, 0.45 + ((i + index) % 3) * 0.26, 0.02]}
              color={i === 3 ? "#79e3df" : "#347c96"}
              emissive={i === 3 ? "#79e3df" : "#347c96"}
            />
          ))}
          <Box
            position={[0, -0.83, 0.1]}
            size={[3.5, 0.025, 0.02]}
            color="#72c8d5"
            emissive="#72c8d5"
          />
        </group>
      ))}

      {/* Server wall: stacked racks with small indicator lights. */}
      <group position={[-10, 0, back + 2.2]}>
        <Box
          position={[0, 1.43, 0]}
          size={[4.3, 2.8, 1.15]}
          color="#152b39"
          rounded
        />
        {[-1.35, 0, 1.35].map((x) => (
          <group key={x}>
            <Box
              position={[x, 1.45, 0.6]}
              size={[1.18, 2.48, 0.05]}
              color="#304a59"
            />
            {[0, 1, 2, 3, 4].map((i) => (
              <group key={i}>
                <Box
                  position={[x, 0.53 + i * 0.45, 0.64]}
                  size={[1.02, 0.32, 0.03]}
                  color="#102532"
                />
                <Box
                  position={[x + 0.36, 0.53 + i * 0.45, 0.67]}
                  size={[0.08, 0.06, 0.02]}
                  color={i === 2 ? "#f2b26d" : "#62d8ce"}
                  emissive={i === 2 ? "#f2b26d" : "#62d8ce"}
                />
              </group>
            ))}
          </group>
        ))}
      </group>

      {/* Enclosed collaboration pod, transparent towards the camera. */}
      <group position={[9.65, 0, back + 4.2]}>
        <Box
          position={[0, 0.08, 0]}
          size={[5.35, 0.13, 6.4]}
          color="#47616d"
          rounded
        />
        <Glass position={[-2.6, 1.45, -0.45]} size={[0.06, 2.8, 5.4]} />
        <Glass position={[0, 1.45, 3.15]} size={[5.2, 2.8, 0.06]} />
        {[-2.6, 2.6].map((x) => (
          <Box
            key={x}
            position={[x, 1.5, 3.15]}
            size={[0.09, 3, 0.09]}
            color="#7798a3"
          />
        ))}
        <Box
          position={[0, 2.95, 3.15]}
          size={[5.25, 0.09, 0.09]}
          color="#77e4e9"
          emissive="#77e4e9"
        />
        <Box
          position={[0, 1.07, 0]}
          size={[2.25, 0.16, 3.2]}
          color="#96abb0"
          rounded
        />
        <Box position={[0, 0.55, 0]} size={[0.28, 1.05, 1.8]} color="#334d59" />
        {[-1, 1].flatMap((z) =>
          [-1, 1].map((side) => (
            <Chair
              key={`${z}:${side}`}
              position={[side * 1.65, 0.15, z]}
              rotation={(side * Math.PI) / 2}
              color="#537582"
            />
          )),
        )}
        <Box
          position={[0, 1.17, 0]}
          size={[0.8, 0.05, 1.1]}
          color="#3ca9ba"
          emissive="#3ca9ba"
          rounded
        />
      </group>

      {/* Forward lounge is an open stepped platform with integrated seating. */}
      <group position={[-10, 0, 5]}>
        <Box
          position={[0, 0.1, 0]}
          size={[5.1, 0.2, 5.4]}
          color="#354d5b"
          rounded
        />
        <Box
          position={[-1.45, 0.55, 0]}
          size={[1.05, 0.65, 3.7]}
          color="#496b78"
          rounded
        />
        <Box
          position={[-1.95, 1, 0]}
          size={[0.18, 1.1, 3.7]}
          color="#72929b"
          rounded
        />
        <Box
          position={[0.45, 0.55, 0]}
          size={[1.65, 0.12, 2.1]}
          color="#91a9ae"
          rounded
        />
        <Box
          position={[0.45, 0.31, 0]}
          size={[0.2, 0.5, 0.2]}
          color="#385666"
        />
        <Box
          position={[1.7, 0.54, 0]}
          size={[0.7, 0.65, 2.4]}
          color="#496b78"
          rounded
        />
      </group>

      {/* A freestanding console and light columns make the opposite wing distinct. */}
      <group position={[9.8, 0, 5.3]}>
        <Box
          position={[0, 0.55, 1.3]}
          size={[4.2, 1.1, 1.3]}
          color="#263f4e"
          rounded
        />
        <Box
          position={[0, 1.15, 1.3]}
          size={[4.35, 0.12, 1.4]}
          color="#7795a0"
          rounded
        />
        <Box
          position={[0, 1.25, 1.3]}
          size={[2.8, 0.035, 0.65]}
          color="#50b7c8"
          emissive="#50b7c8"
        />
        {[-1.8, 1.8].map((x) => (
          <Box
            key={x}
            position={[x, 1.35, -1.4]}
            size={[0.15, 2.7, 0.15]}
            color="#6cd6de"
            emissive="#6cd6de"
          />
        ))}
      </group>

      {/* Suspended linear lights hang from the back wall, leaving the scene open. */}
      {[-4.3, 2.5].map((x) => (
        <group key={x}>
          <Box
            position={[x, 3.24, (back + 1) / 2]}
            size={[0.12, 0.12, 1 - back]}
            color="#304a5b"
          />
          <Box
            position={[x, 3.04, -2]}
            size={[0.3, 0.16, 7]}
            color="#1b3545"
            rounded
          />
          <Box
            position={[x, 2.95, -2]}
            size={[0.22, 0.025, 6.8]}
            color="#a4f5f5"
            emissive="#a4f5f5"
          />
        </group>
      ))}
    </group>
  );
}
