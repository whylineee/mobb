"use client";
import { RoundedBox } from "@react-three/drei";
import { Box } from "./primitives";
import { Plant, Chair, Glass, Sofa } from "./furniture";
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
