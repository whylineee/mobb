import {
  BoxGeometry,
  SphereGeometry,
  ConeGeometry,
  BufferGeometry,
  Color,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  Float32BufferAttribute,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Point = [number, number, number];
const FUR = "#d92125",
  FUR_SHADOW = "#b91b23",
  CREAM = "#f4d69e";
const HAIR = "#d8a45d",
  HAIR_LIGHT = "#f3cd89",
  GLASSES = "#171b1c";

// Bake the fixed body into one colored mesh, shared by every seated agent.
export function createMascotGeometry() {
  const shapes = {
    round: new SphereGeometry(1, 8, 6),
    frame: new BoxGeometry(),
    tuft: new ConeGeometry(1, 1, 5),
  };
  const parts: BufferGeometry[] = [];
  const add = (
    shape: keyof typeof shapes,
    position: Point,
    scale: Point,
    color: string,
    rotation: Point = [0, 0, 0],
    parent?: Matrix4,
  ) => {
    const matrix = new Matrix4().compose(
      new Vector3(...position),
      new Quaternion().setFromEuler(new Euler(...rotation)),
      new Vector3(...scale),
    );
    if (parent) matrix.premultiply(parent);
    const geometry = shapes[shape].clone().applyMatrix4(matrix);
    const tint = new Color(color);
    const colors = new Float32Array(
      geometry.getAttribute("position").count * 3,
    );
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    parts.push(geometry);
  };
  add("round", [0, 1.05, 0], [0.59, 0.67, 0.43], FUR);
  add("round", [0, 1.04, 0.34], [0.43, 0.47, 0.15], CREAM);
  add("round", [0, 0.53, 0.01], [0.55, 0.25, 0.37], "#233d68");
  for (const side of [-1, 1]) {
    add("round", [side * 0.27, 0.39, 0.05], [0.26, 0.14, 0.34], "#294876");
    add("round", [side * 0.28, 0.23, 0.07], [0.19, 0.23, 0.18], FUR);
    add("round", [side * 0.28, 0.11, 0.24], [0.26, 0.13, 0.27], "#dfa24e");
    for (const toe of [-0.1, 0.04, 0.16])
      add(
        "round",
        [side * 0.28 + toe, 0.1, 0.4],
        [0.075, 0.09, 0.09],
        "#ecc17b",
      );
    add("frame", [side * 0.045, 0.53, 0.375], [0.024, 0.15, 0.024], CREAM, [
      0,
      0,
      side * -0.14,
    ]);
    for (const y of [0.92, 1.22])
      add("tuft", [side * 0.53, y, 0], [0.16, 0.34, 0.18], FUR, [
        0,
        0,
        side * -2,
      ]);
    for (const y of [1.52, 1.72])
      add("tuft", [side * 0.47, y, 0], [0.17, 0.32, 0.19], FUR_SHADOW, [
        0,
        0,
        side * -2.25,
      ]);
  }
  add("round", [0, 1.83, 0.015], [0.59, 0.54, 0.43], FUR);
  for (const side of [-1, 1]) {
    add("round", [side * 0.57, 1.94, 0.025], [0.18, 0.28, 0.15], "#684734", [
      0.1,
      0,
      side * 0.28,
    ]);
    add("round", [side * 0.58, 1.94, 0.12], [0.1, 0.21, 0.075], "#8e6546", [
      0.1,
      0,
      side * 0.28,
    ]);
    add("round", [side * 0.23, 1.85, 0.36], [0.25, 0.24, 0.14], "#e5b06a");
    add("round", [side * 0.235, 1.97, 0.425], [0.175, 0.155, 0.075], "#fff5df");
    add("round", [side * 0.225, 1.95, 0.489], [0.09, 0.115, 0.036], "#70401d");
    add("round", [side * 0.215, 1.95, 0.519], [0.048, 0.073, 0.017], "#191714");
    add(
      "round",
      [side * 0.215 - 0.025, 1.995, 0.533],
      [0.025, 0.029, 0.012],
      "#ffffff",
    );
    add("frame", [side * 0.25, 2.18, 0.42], [0.31, 0.065, 0.04], "#543724", [
      0,
      0,
      side * -0.12,
    ]);
    const glasses = new Matrix4().compose(
      new Vector3(side * 0.24, 1.97, 0.535),
      new Quaternion().setFromEuler(new Euler(0, 0, side * -0.035)),
      new Vector3(1, 1, 1),
    );
    for (const y of [-0.15, 0.15])
      add(
        "frame",
        [0, y, 0],
        [0.44, 0.052, 0.055],
        GLASSES,
        [0, 0, 0],
        glasses,
      );
    for (const x of [-0.196, 0.196])
      add("frame", [x, 0, 0], [0.052, 0.3, 0.055], GLASSES, [0, 0, 0], glasses);
    add("frame", [side * 0.47, 1.99, 0.29], [0.044, 0.052, 0.48], GLASSES);
    add("round", [side * 0.15, 1.67, 0.43], [0.21, 0.14, 0.16], "#805b3b");
  }
  add("frame", [0, 2.01, 0.535], [0.11, 0.055, 0.055], GLASSES);
  add("round", [0, 1.55, 0.37], [0.3, 0.13, 0.15], "#b5804e");
  add("round", [0, 1.76, 0.535], [0.12, 0.085, 0.065], "#2b2420");
  add("round", [-0.025, 1.79, 0.586], [0.036, 0.02, 0.014], "#69513d");
  add("round", [0, 1.575, 0.492], [0.19, 0.023, 0.024], "#4b3325");
  // Swept blond locks, with tips that read at the office's normal scale.
  add("round", [0.015, 2.27, 0.16], [0.54, 0.18, 0.31], HAIR, [0.02, 0, -0.12]);
  [-0.4, -0.2, 0, 0.2, 0.37].forEach((x, index) => {
    add(
      "round",
      [x, 2.29 + (2 - Math.abs(index - 2)) * 0.045, 0.21],
      [0.19, 0.15, 0.25],
      index % 2 ? HAIR : HAIR_LIGHT,
      [0.25, 0, -0.48],
    );
    add(
      "tuft",
      [x - 0.1, 2.43 + (2 - Math.abs(index - 2)) * 0.025, 0.12],
      [0.13, 0.36, 0.13],
      index % 2 ? HAIR_LIGHT : HAIR,
      [0.1, 0, 0.72],
    );
  });
  add(
    "round",
    [0.28, 2.25, 0.4],
    [0.27, 0.09, 0.14],
    HAIR_LIGHT,
    [0, 0, -0.25],
  );
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  Object.values(shapes).forEach((shape) => shape.dispose());
  if (!merged) throw new Error("Unable to build agent mascot geometry");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
