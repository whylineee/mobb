import { expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import {
  CAMERA_OFFSET,
  clampOfficeCenter,
  officeCameraLayout,
} from "./office-camera";

it.each([
  [1440, 1000, 4],
  [390, 844, 4],
  [1440, 1000, 15],
])("fits the whole expanded room at %sx%s (%s rows)", (width, height, rows) => {
  const insets = { left: 80, right: 80, top: 48, bottom: 100 };
  const layout = officeCameraLayout(width, height, rows, insets);
  const camera = new OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    0.1,
    1000,
  );
  const target = new Vector3(0, 0.8, 0).add(layout.offset(layout.baseZoom));
  camera.position.copy(target).add(CAMERA_OFFSET);
  camera.lookAt(target);
  camera.zoom = layout.baseZoom;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  for (const x of [-13, 13])
    for (const y of [-0.62, 3.8])
      for (const z of [-layout.depth / 2, layout.depth / 2]) {
        const point = new Vector3(x, y, z).project(camera);
        const screenX = ((point.x + 1) * width) / 2,
          screenY = ((1 - point.y) * height) / 2;
        expect(screenX).toBeGreaterThan(insets.left);
        expect(screenX).toBeLessThan(width - insets.right);
        expect(screenY).toBeGreaterThan(insets.top);
        expect(screenY).toBeLessThan(height - insets.bottom);
      }
});

it("locks panning at minimum zoom and bounds all directions on zoom", () => {
  for (const x of [-10000, 10000])
    for (const z of [-10000, 10000]) {
      expect(
        clampOfficeCenter(new Vector3(x, 99, z), 20, 20, 20).toArray(),
      ).toEqual([0, 0.8, 0]);
      const center = clampOfficeCenter(new Vector3(x, 99, z), 80, 20, 20);
      expect(Math.abs(center.x)).toBeLessThan(13);
      expect(Math.abs(center.z)).toBeLessThan(10);
      expect(center.y).toBe(0.8);
    }
});

it("centers a selected agent in the free viewport between asymmetric panels", () => {
  const width = 1440,
    height = 1000;
  const insets = { left: 640, right: 456, top: 48, bottom: 100 };
  const layout = officeCameraLayout(width, height, 4, insets);
  const zoom = layout.baseZoom * 1.65;
  const center = new Vector3(4, 0.8, 2);
  const target = center.clone().add(layout.offset(zoom));
  const camera = new OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    0.1,
    1000,
  );
  camera.position.copy(target).add(CAMERA_OFFSET);
  camera.lookAt(target);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const projected = center.project(camera);
  expect(((projected.x + 1) * width) / 2).toBeGreaterThan(insets.left);
  expect(((projected.x + 1) * width) / 2).toBeLessThan(width - insets.right);
});
