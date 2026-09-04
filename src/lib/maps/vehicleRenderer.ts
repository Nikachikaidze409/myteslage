// Draws the car. On a vector map it uses a WebGLOverlayView (GPU, perfectly
// in sync with the tilted/rotating basemap). On a raster map it falls back to
// a rotated marker symbol.

import type { LatLng } from "./math";

interface Pose {
  lat: number;
  lng: number;
  heading: number;
}

export class VehicleRenderer {
  private map: any;
  private google: any;
  private pose: Pose | null = null;
  private overlay: any = null;
  private marker: any = null;
  private accuracyCircle: any = null;
  private iconHeading = -999;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private uMatrix: WebGLUniformLocation | null = null;
  private uColor: WebGLUniformLocation | null = null;
  private aPos = -1;

  constructor(map: any, google: any, vector: boolean) {
    this.map = map;
    this.google = google;
    if (vector && google?.maps?.WebGLOverlayView) {
      try {
        this.initWebGL();
      } catch {
        this.overlay = null;
      }
    }
    if (!this.overlay) this.initMarker();
  }

  private initWebGL(): void {
    const g = this.google;
    const overlay = new g.maps.WebGLOverlayView();

    overlay.onAdd = () => {};
    overlay.onContextRestored = ({ gl }: { gl: WebGLRenderingContext }) => {
      this.gl = gl;
      const vs = compile(
        gl,
        gl.VERTEX_SHADER,
        `attribute vec2 aPos; uniform mat4 uMatrix;
         void main() { gl_Position = uMatrix * vec4(aPos, 0.0, 1.0); }`,
      );
      const fs = compile(
        gl,
        gl.FRAGMENT_SHADER,
        `precision mediump float; uniform vec4 uColor;
         void main() { gl_FragColor = uColor; }`,
      );
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      this.program = prog;
      this.aPos = gl.getAttribLocation(prog, "aPos");
      this.uMatrix = gl.getUniformLocation(prog, "uMatrix");
      this.uColor = gl.getUniformLocation(prog, "uColor");
      this.buffer = gl.createBuffer();
    };

    overlay.onDraw = ({ gl, transformer }: any) => {
      const pose = this.pose;
      if (!pose || !this.program || !this.buffer) return;
      // Metres, in a frame rotated so +Y points along the heading.
      const matrix = transformer.fromLatLngAltitude({
        lat: pose.lat,
        lng: pose.lng,
        altitude: 0,
        rotationZ: pose.heading,
        scale: 1,
      });
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.uMatrix, false, matrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(this.aPos);
      gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // White halo, then the blue arrow on top.
      gl.bufferData(gl.ARRAY_BUFFER, ARROW_OUTER, gl.DYNAMIC_DRAW);
      gl.uniform4f(this.uColor, 1, 1, 1, 1);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, ARROW_OUTER.length / 2);

      gl.bufferData(gl.ARRAY_BUFFER, ARROW_INNER, gl.DYNAMIC_DRAW);
      gl.uniform4f(this.uColor, 0.145, 0.388, 0.921, 1);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, ARROW_INNER.length / 2);
    };

    overlay.setMap(this.map);
    this.overlay = overlay;
  }

  private initMarker(): void {
    const g = this.google;
    this.marker = new g.maps.Marker({
      map: this.map,
      title: "You",
      zIndex: 1000,
      optimized: true,
      icon: arrowIcon(g, 0),
    });
  }

  setPose(lat: number, lng: number, heading: number): void {
    this.pose = { lat, lng, heading };
    if (this.overlay) {
      this.overlay.requestRedraw();
      return;
    }
    if (!this.marker) return;
    this.marker.setPosition({ lat, lng });
    if (Math.abs(heading - this.iconHeading) > 2) {
      this.iconHeading = heading;
      this.marker.setIcon(arrowIcon(this.google, heading));
    }
  }

  /** Google-style translucent circle, only while the fix is genuinely vague. */
  setAccuracy(center: LatLng, metres: number, visible: boolean): void {
    const g = this.google;
    if (!visible) {
      this.accuracyCircle?.setMap(null);
      this.accuracyCircle = null;
      return;
    }
    if (!this.accuracyCircle) {
      this.accuracyCircle = new g.maps.Circle({
        map: this.map,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.5,
        strokeWeight: 1,
        fillColor: "#3b82f6",
        fillOpacity: 0.1,
        clickable: false,
        zIndex: 2,
      });
    }
    this.accuracyCircle.setCenter(center);
    this.accuracyCircle.setRadius(metres);
  }

  destroy(): void {
    this.overlay?.setMap(null);
    this.overlay = null;
    this.marker?.setMap(null);
    this.marker = null;
    this.accuracyCircle?.setMap(null);
    this.accuracyCircle = null;
  }
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

// Arrow in metres, pointing along +Y (the heading direction).
const ARROW_INNER = new Float32Array([0, 11, -7.5, -8, 0, -3.5, 7.5, -8]);
const ARROW_OUTER = new Float32Array([0, 14.5, -10, -11, 0, -5, 10, -11]);

function arrowIcon(g: any, heading: number) {
  return {
    path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 6,
    rotation: heading,
    fillColor: "#3b82f6",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 3,
  };
}
