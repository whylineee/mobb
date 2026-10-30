import type { Seat } from "../components/office/primitives";

// One fixed floor plan, shared by furniture, seating and camera bounds.
export const OFFICE = { width: 30, depth: 26, height: 4.6 } as const;
export const WORK_ISLANDS = [
  { x: -4.6, z: -4.3, rows: 2 },
  { x: 4.6, z: -4.3, rows: 2 },
  { x: -4.6, z: 4.6, rows: 2 },
  { x: 4.6, z: 4.6, rows: 1 },
] as const;
export const OFFICE_SEATS: Seat[] = WORK_ISLANDS.flatMap(({ x, z, rows }) =>
  Array.from({ length: rows }, (_, row) =>
    [-1.5, 1.5].map((offset): Seat => [
      x + offset,
      0,
      z + (row - (rows - 1) / 2) * 3.1,
    ]),
  ).flat(),
);
