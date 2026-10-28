"use client";
import { createInstances } from "@react-three/drei";
export type Seat = [number, number, number];
export const [SolidInstances, Solid] = createInstances();
export const [GlowInstances, Glow] = createInstances();
export const [SoftInstances, Soft] = createInstances();
export const [FoliageInstances, Foliage] = createInstances();
export const [PotInstances, Pot] = createInstances();

export function Box({
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
  return props.emissive ? (
    <Glow position={position} scale={size} color={color} />
  ) : rounded ? (
    <Soft position={position} scale={size} color={color} />
  ) : (
    <Solid position={position} scale={size} color={color} />
  );
}
