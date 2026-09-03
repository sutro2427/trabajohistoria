import type { PixelBuffer } from '../art/PixelBuffer.js';
import type { BakedArt } from '../art/SpriteBaker.js';
import type { ClipName } from '../art/AnimationCatalog.js';

/**
 * Sube el arte horneado a lienzos que la GPU pueda dibujar rápido.
 *
 * Esta es la **única pieza del sistema de arte que toca el DOM**. Todo lo
 * anterior —recetas, poses, horneado— es TypeScript puro. Gracias a esa
 * frontera, el arte se puede generar y verificar en un test de Node.
 *
 * Se usa `<canvas>` y no `createImageBitmap` a propósito: `createImageBitmap`
 * es asíncrono y obligaría a que el arranque del juego fuese una cadena de
 * promesas. Con lienzos, `drawImage` recibe una fuente igual de rápida y todo
 * el horneado ocurre de forma síncrona en el arranque.
 */
export type Sprite = HTMLCanvasElement;

/** Conjunto de fotogramas de un clip, en sus dos orientaciones. */
export interface SpriteClip {
  readonly right: readonly Sprite[];
  readonly left: readonly Sprite[];
}

export type SpriteUnit = Readonly<Record<ClipName, SpriteClip>>;

/** Convierte un búfer de píxeles en un lienzo listo para dibujar. */
function toCanvas(buffer: PixelBuffer): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('SpriteAtlas: no se pudo obtener el contexto 2D');
  const image = ctx.createImageData(buffer.width, buffer.height);
  image.data.set(buffer.data);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export class SpriteAtlas {
  readonly units: Readonly<Record<string, SpriteUnit>>;
  readonly structures: Readonly<Record<string, Sprite>>;
  readonly props: Readonly<Record<string, Sprite>>;
  readonly background: Readonly<Record<string, Sprite>>;

  constructor(art: BakedArt) {
    const units: Record<string, SpriteUnit> = {};
    for (const [unitId, clips] of Object.entries(art.units)) {
      const converted: Partial<Record<ClipName, SpriteClip>> = {};
      for (const [clipName, baked] of Object.entries(clips)) {
        converted[clipName as ClipName] = {
          right: baked.right.map(toCanvas),
          left: baked.left.map(toCanvas),
        };
      }
      units[unitId] = converted as SpriteUnit;
    }
    this.units = units;

    this.structures = mapValues(art.structures, toCanvas);
    this.props = mapValues(art.props, toCanvas);
    this.background = mapValues(art.background, toCanvas);
  }

  /**
   * Fotograma concreto de una unidad.
   * Devuelve `undefined` en lugar de fallar: un sprite que falta debe dejar un
   * hueco, nunca tumbar el bucle de render.
   */
  frame(unitId: string, clip: ClipName, frame: number, facing: 1 | -1): Sprite | undefined {
    const frames = this.units[unitId]?.[clip];
    if (!frames) return undefined;
    const list = facing === 1 ? frames.right : frames.left;
    return list[Math.min(frame, list.length - 1)];
  }
}

function mapValues<T, R>(source: Record<string, T>, fn: (value: T) => R): Record<string, R> {
  const out: Record<string, R> = {};
  for (const [key, value] of Object.entries(source)) out[key] = fn(value);
  return out;
}
