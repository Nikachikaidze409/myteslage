import { describe, expect, it } from "vitest";
import {
  coordsFromMapsUrl,
  isAllowedMapsHost,
  parsePastedLocation,
  placeNameFromMapsUrl,
} from "./place-link";

describe("parsePastedLocation", () => {
  it("reads raw coordinates", () => {
    expect(parsePastedLocation("41.7151, 44.8271")).toEqual({
      kind: "coords",
      lat: 41.7151,
      lng: 44.8271,
    });
  });

  it("reads coordinates out of a full maps url", () => {
    const r = parsePastedLocation(
      "look here https://www.google.com/maps/place/Foo/@41.7151,44.8271,15z",
    );
    expect(r).toEqual({ kind: "coords", lat: 41.7151, lng: 44.8271 });
  });

  it("keeps short links for server-side expansion", () => {
    expect(parsePastedLocation("https://maps.app.goo.gl/abc123")).toEqual({
      kind: "url",
      url: "https://maps.app.goo.gl/abc123",
    });
  });

  it("falls back to a text query", () => {
    expect(parsePastedLocation("რუსთაველის 24")).toEqual({
      kind: "query",
      text: "რუსთაველის 24",
    });
  });

  it("ignores empty text", () => {
    expect(parsePastedLocation("   ")).toBeNull();
  });
});

describe("coordsFromMapsUrl", () => {
  it("prefers the pin coordinates", () => {
    expect(
      coordsFromMapsUrl("https://www.google.com/maps/place/X/@40.1,44.1,17z/data=!3d41.7151!4d44.8271"),
    ).toEqual({ lat: 41.7151, lng: 44.8271 });
  });

  it("reads the query parameter", () => {
    expect(coordsFromMapsUrl("https://maps.google.com/?q=41.7151,44.8271")).toEqual({
      lat: 41.7151,
      lng: 44.8271,
    });
  });

  it("returns null without coordinates", () => {
    expect(coordsFromMapsUrl("https://maps.app.goo.gl/abc")).toBeNull();
  });
});

describe("placeNameFromMapsUrl", () => {
  it("reads a place name from the path", () => {
    expect(placeNameFromMapsUrl("https://www.google.com/maps/place/Tbilisi+Mall")).toBe(
      "Tbilisi Mall",
    );
  });
});

describe("isAllowedMapsHost", () => {
  it("allows google share hosts", () => {
    expect(isAllowedMapsHost("https://maps.app.goo.gl/x")).toBe(true);
    expect(isAllowedMapsHost("https://www.google.com/maps/x")).toBe(true);
  });

  it("blocks anything else", () => {
    expect(isAllowedMapsHost("https://evil.example.com/maps")).toBe(false);
  });
});
