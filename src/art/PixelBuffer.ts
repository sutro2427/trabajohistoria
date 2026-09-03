import type { Rng } from '../core/Rng.js';

/**
 * Lienzo de píxeles RGBA en memoria pura — sin canvas, sin DOM.
 *
 * Todo el arte del juego se dibuja aquí y solo al final se sube a la GPU
 * (ver `render/SpriteAtlas.ts`). Esa separación permite hornear y comparar
 * sprites dentro de un test de Node, sin navegador.
 */

/** Color RGBA con canales 0-255. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** Construye un color a partir de una cadena "#rrggbb" o "#rrggbbaa". */
export function hex(value: string, alpha = 255): Rgba {
  const s = value.replace('#', '');
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
    a: s.length >= 8 ? parseInt(s.slice(6, 8), 16) : alpha,
  };
}

/** Color totalmente transparente; representa "nada dibujado". */
export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

/** Mezcla dos colores. `t` = 0 devuelve `a`, `t` = 1 devuelve `b`. */
export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
    a: Math.round(a.a + (b.a - a.a) * t),
  };
}

/** Oscurece (`factor` < 1) o aclara (`factor` > 1) un color conservando su alfa. */
export function shade(c: Rgba, factor: number): Rgba {
  const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return { r: clamp255(c.r * factor), g: clamp255(c.g * factor), b: clamp255(c.b * factor), a: c.a };
}

/** Desatura un color hacia su gris equivalente. `amount` de 0 a 1. */
export function desaturate(c: Rgba, amount: number): Rgba {
  const gray = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
  return mix(c, { r: gray, g: gray, b: gray, a: c.a }, amount);
}

export class PixelBuffer {
  readonly width: number;
  readonly height: number;
  /** Datos RGBA en orden de escaneo, 4 bytes por píxel. */
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error('PixelBuffer: dimensiones inválidas');
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /** Copia independiente del búfer. */
  clone(): PixelBuffer {
    const copy = new PixelBuffer(this.width, this.height);
    copy.data.set(this.data);
    return copy;
  }

  private index(x: number, y: number): number {
    return (y * this.width + x) * 4;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Pinta un píxel (reemplaza, no mezcla). Ignora las coordenadas fuera del lienzo. */
  set(x: number, y: number, c: Rgba): void {
    const px = x | 0;
    const py = y | 0;
    if (!this.inBounds(px, py)) return;
    const i = this.index(px, py);
    this.data[i] = c.r;
    this.data[i + 1] = c.g;
    this.data[i + 2] = c.b;
    this.data[i + 3] = c.a;
  }

  /** Pinta un píxel mezclándolo con lo que hubiera debajo (alpha blending). */
  blend(x: number, y: number, c: Rgba): void {
    if (c.a === 0) return;
    if (c.a === 255) return this.set(x, y, c);
    const px = x | 0;
    const py = y | 0;
    if (!this.inBounds(px, py)) return;
    const i = this.index(px, py);
    const sa = c.a / 255;
    const da = (this.data[i + 3] ?? 0) / 255;
    const outA = sa + da * (1 - sa);
    if (outA === 0) return;
    const blendChannel = (src: number, dst: number) =>
      Math.round((src * sa + dst * da * (1 - sa)) / outA);
    this.data[i] = blendChannel(c.r, this.data[i] ?? 0);
    this.data[i + 1] = blendChannel(c.g, this.data[i + 1] ?? 0);
    this.data[i + 2] = blendChannel(c.b, this.data[i + 2] ?? 0);
    this.data[i + 3] = Math.round(outA * 255);
  }

  /** Lee el color de un píxel. Fuera del lienzo devuelve transparente. */
  get(x: number, y: number): Rgba {
    const px = x | 0;
    const py = y | 0;
    if (!this.inBounds(px, py)) return TRANSPARENT;
    const i = this.index(px, py);
    return {
      r: this.data[i] ?? 0,
      g: this.data[i + 1] ?? 0,
      b: this.data[i + 2] ?? 0,
      a: this.data[i + 3] ?? 0,
    };
  }

  /** `true` si el píxel tiene algo dibujado. */
  isOpaque(x: number, y: number): boolean {
    const px = x | 0;
    const py = y | 0;
    if (!this.inBounds(px, py)) return false;
    return (this.data[this.index(px, py) + 3] ?? 0) > 0;
  }

  /** Rellena todo el lienzo con un color. */
  fill(c: Rgba): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) this.set(x, y, c);
    }
  }

  /** Rectángulo relleno. */
  rect(x: number, y: number, w: number, h: number, c: Rgba): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let yy = y0; yy < y0 + Math.round(h); yy++) {
      for (let xx = x0; xx < x0 + Math.round(w); xx++) this.set(xx, yy, c);
    }
  }

  /** Contorno de rectángulo, de un píxel de grosor. */
  rectOutline(x: number, y: number, w: number, h: number, c: Rgba): void {
    this.hLine(x, x + w - 1, y, c);
    this.hLine(x, x + w - 1, y + h - 1, c);
    this.vLine(x, y, y + h - 1, c);
    this.vLine(x + w - 1, y, y + h - 1, c);
  }

  /** Línea horizontal inclusiva. */
  hLine(x0: number, x1: number, y: number, c: Rgba): void {
    const from = Math.round(Math.min(x0, x1));
    const to = Math.round(Math.max(x0, x1));
    for (let x = from; x <= to; x++) this.set(x, y, c);
  }

  /** Línea vertical inclusiva. */
  vLine(x: number, y0: number, y1: number, c: Rgba): void {
    const from = Math.round(Math.min(y0, y1));
    const to = Math.round(Math.max(y0, y1));
    for (let y = from; y <= to; y++) this.set(x, y, c);
  }

  /** Línea entre dos puntos (algoritmo de Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x, y, c);
      if (x === xe && y === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  /** Elipse rellena inscrita en el rectángulo dado. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Rgba): void {
    if (rx <= 0 || ry <= 0) return;
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, c);
      }
    }
  }

  /** Copia otro búfer encima, respetando la transparencia. */
  blit(src: PixelBuffer, dx: number, dy: number, alpha = 1): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const c = src.get(x, y);
        if (c.a === 0) continue;
        this.blend(dx + x, dy + y, alpha >= 1 ? c : { ...c, a: Math.round(c.a * alpha) });
      }
    }
  }

  /** Devuelve una copia reflejada horizontalmente (para el sprite mirando al otro lado). */
  mirrorX(): PixelBuffer {
    const out = new PixelBuffer(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        out.set(this.width - 1 - x, y, this.get(x, y));
      }
    }
    return out;
  }

  /** Sustituye todos los píxeles de un color exacto por otro. */
  replaceColor(from: Rgba, to: Rgba): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (c.a > 0 && c.r === from.r && c.g === from.g && c.b === from.b) this.set(x, y, to);
      }
    }
  }

  /**
   * Contorno de un píxel alrededor de todo lo dibujado.
   *
   * Esta es la función más importante del módulo: el contorno oscuro es lo que
   * separa la silueta del fondo y lo que hace que un dibujo "parezca pixel art"
   * en lugar de una mancha de colores. Todos los sprites pasan por aquí.
   */
  outline(color: Rgba, diagonal = false): void {
    const original = this.clone();
    const neighbours = diagonal
      ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
      : [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (original.isOpaque(x, y)) continue;
        for (const [ox, oy] of neighbours) {
          if (original.isOpaque(x + (ox as number), y + (oy as number))) {
            this.set(x, y, color);
            break;
          }
        }
      }
    }
  }

  /**
   * Oscurece progresivamente las filas inferiores.
   * Simula luz cenital y da volumen a formas planas con una sola llamada.
   */
  shadeRows(fromY: number, factorTop: number, factorBottom: number): void {
    const span = Math.max(1, this.height - fromY);
    for (let y = fromY; y < this.height; y++) {
      const t = (y - fromY) / span;
      const factor = factorTop + (factorBottom - factorTop) * t;
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (c.a > 0) this.set(x, y, shade(c, factor));
      }
    }
  }

  /**
   * Salpica píxeles de un color sobre lo ya dibujado.
   * Es lo que ensucia al recolector: barro, sudor y uniforme gastado.
   *
   * @param density Fracción de píxeles opacos afectados (0..1).
   */
  speckle(rng: Rng, color: Rgba, density: number): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.isOpaque(x, y) && rng.chance(density)) this.blend(x, y, color);
      }
    }
  }

  /** Aplica una transformación de color a cada píxel opaco. */
  mapColors(fn: (c: Rgba, x: number, y: number) => Rgba): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (c.a > 0) this.set(x, y, fn(c, x, y));
      }
    }
  }

  /** Recuadro mínimo que contiene todo lo dibujado, o `null` si está vacío. */
  bounds(): { x: number; y: number; w: number; h: number } | null {
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.isOpaque(x, y)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
}
