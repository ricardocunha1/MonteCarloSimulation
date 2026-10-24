// Recording mock of the 2D canvas context (jsdom has no canvas), for the PNG export tests.
import { vi } from "vitest";
import type { PngContext } from "../lib/releasePlan/png";

export interface Call {
  op: string;
  args: unknown[];
  fillStyle: string;
  strokeStyle: string;
  font: string;
  globalAlpha: number;
  textAlign: CanvasTextAlign;
}

/** Recording 2D context: every method call with the drawing state at that time; text is 6 px per char. */
export class RecordingContext implements PngContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  globalAlpha = 1;
  shadowColor = "transparent";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  calls: Call[] = [];
  private stack: Array<Pick<RecordingContext, "fillStyle" | "strokeStyle" | "font" | "globalAlpha" | "textAlign">> = [];

  private rec(op: string, args: unknown[]): void {
    this.calls.push({
      op,
      args,
      fillStyle: String(this.fillStyle),
      strokeStyle: String(this.strokeStyle),
      font: this.font,
      globalAlpha: this.globalAlpha,
      textAlign: this.textAlign,
    });
  }

  save() {
    this.stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, font: this.font, globalAlpha: this.globalAlpha, textAlign: this.textAlign });
    this.rec("save", []);
  }
  restore() {
    const s = this.stack.pop();
    if (s) Object.assign(this, s);
    this.rec("restore", []);
  }
  scale(x: number, y: number) { this.rec("scale", [x, y]); }
  translate(x: number, y: number) { this.rec("translate", [x, y]); }
  rotate(angle: number) { this.rec("rotate", [angle]); }
  fillRect(x: number, y: number, w: number, h: number) { this.rec("fillRect", [x, y, w, h]); }
  fillText(text: string, x: number, y: number) { this.rec("fillText", [text, x, y]); }
  measureText(text: string) { return { width: text.length * 6 }; }
  beginPath() { this.rec("beginPath", []); }
  closePath() { this.rec("closePath", []); }
  moveTo(x: number, y: number) { this.rec("moveTo", [x, y]); }
  lineTo(x: number, y: number) { this.rec("lineTo", [x, y]); }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) { this.rec("arcTo", [x1, y1, x2, y2, r]); }
  arc(x: number, y: number, r: number, s: number, e: number) { this.rec("arc", [x, y, r, s, e]); }
  fill() { this.rec("fill", []); }
  stroke() { this.rec("stroke", []); }
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) { this.rec("drawImage", [image, dx, dy, dw, dh]); }

  texts(): string[] {
    return this.calls.filter((c) => c.op === "fillText").map((c) => String(c.args[0]));
  }
  text(s: string): Call {
    const c = this.calls.find((x) => x.op === "fillText" && x.args[0] === s);
    if (!c) throw new Error(`no fillText "${s}" in ${JSON.stringify(this.texts())}`);
    return c;
  }
  ops(op: string): Call[] {
    return this.calls.filter((c) => c.op === op);
  }
}

/** Stand-in for `Image` (jsdom never loads images): setting `src` fires `onload` (or `onerror` when `fail`) on a microtask; with `hold`, neither fires until `release()`. */
export class FakeImage {
  static fail = false;
  static hold = false;
  private static pending: Array<() => void> = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 178;
  naturalHeight = 44;
  private _src = "";

  get src(): string {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    const fire = () => (FakeImage.fail ? this.onerror?.() : this.onload?.());
    if (FakeImage.hold) {
      FakeImage.pending.push(fire);
    } else {
      queueMicrotask(fire);
    }
  }

  /** Fires the load events held while `hold` was set. */
  static release(): void {
    const fns = FakeImage.pending;
    FakeImage.pending = [];
    fns.forEach((fn) => fn());
  }

  static reset(): void {
    FakeImage.fail = false;
    FakeImage.hold = false;
    FakeImage.pending = [];
  }
}

/** Options of {@link stubCanvas}. */
export interface CanvasStub {
  /** Context returned by `getContext("2d")`; `null` = no 2D context. */
  context: RecordingContext | null;
  /** Blob passed to the `toBlob` callback; `null` = encoding failed. */
  blob: Blob | null;
}

/**
 * Stubs `HTMLCanvasElement.prototype.getContext`/`toBlob` (jsdom has no canvas).
 * Restore with `vi.restoreAllMocks()`. Returns the canvases that were drawn on.
 */
export function stubCanvas(stub: CanvasStub): HTMLCanvasElement[] {
  const canvases: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push(this);
    // The recording context implements only the subset drawBoardPng uses.
    return stub.context as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback: BlobCallback) => {
    queueMicrotask(() => callback(stub.blob));
  });
  return canvases;
}
