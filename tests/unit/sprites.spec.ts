import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bakeArt } from '../../src/art/SpriteBaker.js';
import { PixelBuffer, hex } from '../../src/art/PixelBuffer.js';
import { Rng } from '../../src/core/Rng.js';

/**
 * Verificación del arte procedural sin abrir un navegador.
 *
 * Es posible porque el generador de sprites es TypeScript puro: dibuja sobre
 * búferes de píxeles en memoria y solo se convierte a lienzos en el momento de
 * renderizar.
 */

function fingerprint(buffer: PixelBuffer): string {
  return createHash('sha1').update(Buffer.from(buffer.data)).digest('hex').slice(0, 12);
}

describe('Generación de sprites', () => {
  it('hornea todo el arte dentro del presupuesto de arranque', () => {
    const art = bakeArt();
    // Por encima de este umbral, el arranque del juego se notaría lento y
    // habría que repartir el horneado entre varios fotogramas.
    expect(art.bakeMs).toBeLessThan(400);
  });

  it('produce sprites idénticos en cada ejecución', () => {
    // El determinismo del arte es lo que permite detectar una regresión
    // visual comparando huellas, sin tener que mirar imágenes a ojo.
    const a = bakeArt(12345);
    const b = bakeArt(12345);

    const clipA = a.units['us_rifleman']?.idle.right[0];
    const clipB = b.units['us_rifleman']?.idle.right[0];
    expect(clipA).toBeDefined();
    expect(fingerprint(clipA as PixelBuffer)).toBe(fingerprint(clipB as PixelBuffer));
  });

  it('genera las tres unidades a pie con todos sus clips', () => {
    const art = bakeArt();
    for (const unitId of ['us_rifleman', 'us_harvester', 'vc_guerrilla']) {
      const unit = art.units[unitId];
      expect(unit, `falta la unidad ${unitId}`).toBeDefined();
      for (const clip of ['idle', 'walk', 'hit', 'die'] as const) {
        const frames = unit?.[clip].right;
        expect(frames?.length, `${unitId}/${clip} sin fotogramas`).toBeGreaterThan(0);
        // Ningún fotograma puede salir vacío: sería un hueco en pantalla.
        expect(frames?.[0]?.bounds(), `${unitId}/${clip} está en blanco`).not.toBeNull();
      }
    }
  });

  it('las tres unidades son visualmente distintas entre sí', () => {
    // Si dos unidades se dibujaran igual, el jugador no podría distinguir a un
    // aliado de un enemigo — el fallo de diseño más grave posible aquí.
    const art = bakeArt();
    const prints = ['us_rifleman', 'us_harvester', 'vc_guerrilla'].map((id) =>
      fingerprint(art.units[id]?.idle.right[0] as PixelBuffer),
    );
    expect(new Set(prints).size).toBe(3);
  });

  it('el fotograma reflejado no coincide con el original', () => {
    const art = bakeArt();
    const clip = art.units['us_rifleman']?.walk;
    expect(fingerprint(clip?.right[0] as PixelBuffer)).not.toBe(
      fingerprint(clip?.left[0] as PixelBuffer),
    );
  });

  it('genera todas las capas del escenario de selva', () => {
    const art = bakeArt();
    for (const layer of ['sky', 'hills', 'canopyFar', 'canopyNear', 'foreground', 'ground']) {
      const buffer = art.background[layer as keyof typeof art.background];
      expect(buffer, `falta la capa ${layer}`).toBeDefined();
      expect(buffer.bounds(), `la capa ${layer} está vacía`).not.toBeNull();
    }
  });

  it('las capas de selva son opacas en su base', () => {
    // Es la regresión del fallo que dejaba bandas negras entre el dosel y el
    // suelo: si la base de una capa tiene huecos, se ve el vacío de detrás.
    const art = bakeArt();
    for (const layer of ['canopyFar', 'canopyNear', 'ground'] as const) {
      const buffer = art.background[layer];
      const bottomRow = buffer.height - 2;
      let opaque = 0;
      for (let x = 0; x < buffer.width; x++) {
        if (buffer.isOpaque(x, bottomRow)) opaque++;
      }
      expect(opaque, `la capa ${layer} tiene huecos en su base`).toBe(buffer.width);
    }
  });
});

describe('PixelBuffer', () => {
  it('el contorno rodea la silueta y no la invade', () => {
    // `outline` es la función de la que depende todo el aspecto pixel art.
    const buf = new PixelBuffer(8, 8);
    const white = hex('#ffffff');
    const black = hex('#000000');
    buf.rect(3, 3, 2, 2, white);
    buf.outline(black);

    // El interior se conserva intacto.
    expect(buf.get(3, 3)).toEqual(white);
    // Los cuatro lados quedan contorneados.
    expect(buf.get(2, 3)).toEqual(black);
    expect(buf.get(5, 3)).toEqual(black);
    expect(buf.get(3, 2)).toEqual(black);
    expect(buf.get(3, 5)).toEqual(black);
    // Sin diagonales, las esquinas quedan libres.
    expect(buf.isOpaque(2, 2)).toBe(false);
  });

  it('el reflejo horizontal invierte las columnas', () => {
    const buf = new PixelBuffer(4, 1);
    const c = hex('#ff0000');
    buf.set(0, 0, c);
    const mirrored = buf.mirrorX();
    expect(mirrored.isOpaque(3, 0)).toBe(true);
    expect(mirrored.isOpaque(0, 0)).toBe(false);
  });

  it('el generador con semilla es reproducible', () => {
    const a = new Rng(99);
    const b = new Rng(99);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
});
