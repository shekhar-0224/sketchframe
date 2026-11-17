"use client";

/**
 * 2.5D "motion comic" renderer. Given a panel and its depth map (near = white), a
 * fragment shader displaces each pixel by its depth, so foreground and background
 * slide at different speeds like a real camera move. Output is drawn into the movie's
 * 2D canvas, so captions/overlays/export all keep working unchanged.
 */

export type ParallaxParams = {
  /** Overall zoom (>1 crops in; leaves room for parallax at the edges). */
  zoom: number;
  /** Frame pan, in fractions of the image. */
  panX: number;
  panY: number;
  /** Parallax offset: how far the nearest layer shifts relative to the focus plane. */
  parX: number;
  parY: number;
  /** Depth-weighted push (dolly): near things grow faster than far ones. */
  dolly: number;
  /** Subtle "breathing" scale on the nearest layer (keeps characters alive). */
  breathe: number;
};

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uImg;
uniform sampler2D uDepth;
uniform vec2 uCover;
uniform vec2 uPan;
uniform vec2 uPar;
uniform float uZoom;
uniform float uDolly;
uniform float uBreathe;
varying vec2 vUv;
const float FOCUS = 0.45;
void main() {
  vec2 base = (vUv - 0.5) * uCover / uZoom + 0.5 + uPan;
  // A few fixed-point steps approximate occlusion: sample depth where the pixel lands.
  vec2 p = base;
  for (int i = 0; i < 4; i++) {
    float d = texture2D(uDepth, clamp(p, 0.0, 1.0)).r;
    float k = d - FOCUS;
    float s = 1.0 + uDolly * d + uBreathe * smoothstep(0.55, 1.0, d);
    p = 0.5 + (base - 0.5) / s - uPar * k;
  }
  gl_FragColor = texture2D(uImg, clamp(p, 0.002, 0.998));
}`;

export class ParallaxRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private textures = new Map<HTMLImageElement, WebGLTexture>();
  private u: Record<string, WebGLUniformLocation | null> = {};

  /** Returns null when WebGL is unavailable; the engine then falls back to flat camera moves. */
  static create(width: number, height: number) {
    try {
      return new ParallaxRenderer(width, height);
    } catch {
      return null;
    }
  }

  private constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uImg", "uDepth", "uCover", "uPan", "uPar", "uZoom", "uDolly", "uBreathe"]) this.u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.u.uImg, 0);
    gl.uniform1i(this.u.uDepth, 1);
  }

  private texture(img: HTMLImageElement) {
    const cached = this.textures.get(img);
    if (cached) return cached;
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    // NPOT-safe settings for WebGL1.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.textures.set(img, t);
    return t;
  }

  render(img: HTMLImageElement, depth: HTMLImageElement, p: ParallaxParams) {
    const gl = this.gl;
    const { width: W, height: H } = this.canvas;
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture(img));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture(depth));
    // Cover-fit: sample only the part of the image that fills the frame.
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const frameAspect = W / H;
    const cover = imgAspect > frameAspect ? [frameAspect / imgAspect, 1] : [1, imgAspect / frameAspect];
    gl.uniform2f(this.u.uCover, cover[0], cover[1]);
    gl.uniform2f(this.u.uPan, p.panX, p.panY);
    gl.uniform2f(this.u.uPar, p.parX, p.parY);
    gl.uniform1f(this.u.uZoom, p.zoom);
    gl.uniform1f(this.u.uDolly, p.dolly);
    gl.uniform1f(this.u.uBreathe, p.breathe);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  dispose() {
    for (const t of this.textures.values()) this.gl.deleteTexture(t);
    this.textures.clear();
  }
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Camera move → 2.5D parameters at progress p (0..1) and absolute time t (for life).
 * Parallax amounts stay small: big shifts tear sketches apart at depth edges.
 */
export function parallaxFor(move: string, p: number, t: number, seed: number): ParallaxParams {
  const e = ease(p);
  const m = move.toLowerCase();
  const breathe = 0.006 * Math.sin(t * 1.9 + seed);
  const base: ParallaxParams = { zoom: 1.06, panX: 0, panY: 0, parX: 0, parY: 0, dolly: 0, breathe };
  if (/push|dolly|zoom/.test(m)) return { ...base, zoom: lerp(1.05, 1.16, e), dolly: lerp(0, 0.07, e), panY: lerp(0, -0.01, e) };
  if (/pull/.test(m)) return { ...base, zoom: lerp(1.16, 1.05, e), dolly: lerp(0.07, 0, e) };
  if (/pan/.test(m)) return { ...base, zoom: 1.1, panX: lerp(0.035, -0.035, e), parX: lerp(0.018, -0.018, e) };
  if (/track/.test(m)) return { ...base, zoom: 1.1, panX: lerp(-0.03, 0.03, e), parX: lerp(-0.028, 0.028, e) };
  if (/tilt/.test(m)) return { ...base, zoom: 1.1, panY: lerp(0.03, -0.03, e), parY: lerp(0.014, -0.014, e) };
  if (/crane/.test(m)) return { ...base, zoom: lerp(1.14, 1.06, e), panY: lerp(-0.03, 0.015, e), parY: lerp(-0.02, 0.012, e) };
  if (/hand/.test(m)) {
    const k = t * 3 + seed;
    return { ...base, zoom: 1.08, panX: Math.sin(k * 2.1) * 0.004, panY: Math.cos(k * 1.7) * 0.004, parX: Math.sin(k * 1.3) * 0.008, parY: Math.cos(k * 0.9) * 0.005 };
  }
  // Static: a slow orbit — the "3D photo" look that makes a still feel like a shot.
  const a = p * Math.PI * 1.2 + seed;
  return { ...base, zoom: lerp(1.06, 1.09, e), parX: Math.sin(a) * 0.022, parY: Math.cos(a) * 0.009 };
}
