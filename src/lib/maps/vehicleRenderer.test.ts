import { describe, expect, it, vi } from "vitest";
import { VehicleRenderer } from "./vehicleRenderer";

function setup() {
  const setIcon = vi.fn();
  class Marker {
    setPosition = vi.fn();
    setIcon = setIcon;
    setMap = vi.fn();
  }
  class Point {
    constructor(public x: number, public y: number) {}
  }
  const google = { maps: { Marker, Point, Circle: class {} } };
  const renderer = new VehicleRenderer({}, google, true);
  return { renderer, setIcon };
}

describe("VehicleRenderer heading synchronization", () => {
  it.each([
    [0, 0, 0],
    [90, 90, 0],
    [180, 90, 90],
    [350, 10, 340],
  ])("renders road heading %s against camera heading %s as %s degrees", (road, camera, expected) => {
    const { renderer, setIcon } = setup();
    renderer.setPose(41.7, 44.8, road, camera);
    expect(setIcon).toHaveBeenCalledWith(expect.objectContaining({ rotation: expected }));
  });
});