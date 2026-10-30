import { Vector3 } from "three";
import { OFFICE } from "./office-space";

export type SceneInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export const HOME: [number, number, number] = [26, 27, 30];
export const CAMERA_OFFSET = new Vector3(...HOME).sub(new Vector3(0, 0.8, 0));
const right = new Vector3(CAMERA_OFFSET.z, 0, -CAMERA_OFFSET.x).normalize();
const up = CAMERA_OFFSET.clone().cross(right).normalize();

// Solve a screen-plane displacement on the floor, preserving camera elevation.
function floorOffset(x: number, y: number) {
  const determinant = right.x * up.z - right.z * up.x;
  return new Vector3(
    (x * up.z - right.z * y) / determinant,
    0,
    (right.x * y - x * up.x) / determinant,
  );
}

export function officeCameraLayout(
  width: number,
  height: number,
  insets: SceneInsets,
) {
  const depth = OFFICE.depth;
  const points = [-OFFICE.width / 2 - 0.2, OFFICE.width / 2 + 0.2].flatMap(
    (x) =>
      [-0.65, OFFICE.height + 0.2].flatMap((y) =>
        [-depth / 2 - 0.2, depth / 2 + 0.2].map(
          (z) => new Vector3(x, y - 0.8, z),
        ),
      ),
  );
  const xs = points.map((point) => point.dot(right));
  const ys = points.map((point) => point.dot(up));
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const availableWidth = Math.max(120, width - insets.left - insets.right);
  const availableHeight = Math.max(120, height - insets.top - insets.bottom);
  const baseZoom =
    Math.min(availableWidth / (maxX - minX), availableHeight / (maxY - minY)) *
    0.92;
  return {
    baseZoom,
    depth,
    offset(zoom: number) {
      return floorOffset(
        (minX + maxX) / 2 - (insets.left - insets.right) / (2 * zoom),
        (minY + maxY) / 2 - (insets.bottom - insets.top) / (2 * zoom),
      );
    },
  };
}

export function clampOfficeCenter(
  center: Vector3,
  zoom: number,
  baseZoom: number,
) {
  const fraction = Math.max(0, Math.min(1, 1 - baseZoom / zoom));
  if (fraction === 0) return center.set(0, 0.8, 0);
  const halfWidth = OFFICE.width / 2;
  center.x = Math.max(
    -halfWidth * fraction,
    Math.min(halfWidth * fraction, center.x),
  );
  center.y = 0.8;
  center.z = Math.max(
    (-OFFICE.depth / 2) * fraction,
    Math.min((OFFICE.depth / 2) * fraction, center.z),
  );
  return center;
}
