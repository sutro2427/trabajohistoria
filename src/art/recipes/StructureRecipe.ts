import { PixelBuffer, shade, mix } from '../PixelBuffer.js';
import { PALETTE } from '../palette.js';
import type { Rng } from '../../core/Rng.js';

/**
 * Recetas de las estructuras: la base estadounidense y las posiciones
 * enemigas. Son los dos polos del mapa, así que deben leerse de inmediato
 * y ser inconfundibles entre sí.
 */

export const BASE_W = 68;
export const BASE_H = 56;

/**
 * Base de Fuego estadounidense.
 *
 * Lenguaje visual: sacos terreros, lona de tienda, torre de vigilancia con
 * bandera y cajas de suministro apiladas. Todo en verde oliva y caqui.
 */
export function drawUsFirebase(rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(BASE_W, BASE_H);
  const groundY = BASE_H - 1;

  // --- Plataforma de tierra apisonada ---
  buf.rect(2, groundY - 5, BASE_W - 4, 6, PALETTE.mud);
  buf.hLine(2, BASE_W - 3, groundY - 5, shade(PALETTE.mud, 1.25));

  // --- Torre de vigilancia (a la izquierda, la silueta más alta) ---
  const towerX = 6;
  const towerTop = 8;
  buf.vLine(towerX, towerTop, groundY - 5, PALETTE.brown);
  buf.vLine(towerX + 7, towerTop, groundY - 5, PALETTE.brown);
  // Travesaños de refuerzo.
  for (let y = towerTop + 6; y < groundY - 6; y += 7) {
    buf.hLine(towerX, towerX + 7, y, shade(PALETTE.brown, 0.75));
  }
  // Plataforma y techo de la torre.
  buf.rect(towerX - 2, towerTop - 1, 12, 2, PALETTE.brownLight);
  buf.rect(towerX - 3, towerTop - 5, 14, 4, PALETTE.olive);
  buf.hLine(towerX - 3, towerX + 10, towerTop - 5, PALETTE.oliveLight);
  // Mástil y bandera: el punto de color que marca "esto es tuyo".
  buf.vLine(towerX + 4, towerTop - 12, towerTop - 5, PALETTE.steelLight);
  buf.rect(towerX + 5, towerTop - 12, 6, 4, PALETTE.usAccent);
  buf.hLine(towerX + 5, towerX + 10, towerTop - 11, PALETTE.sand);

  // --- Tienda de campaña (centro) ---
  const tentX = 22;
  const tentBase = groundY - 5;
  for (let i = 0; i < 11; i++) {
    // Tejado a dos aguas dibujado fila a fila: cada fila es más ancha.
    const halfWidth = i + 1;
    buf.hLine(tentX + 11 - halfWidth, tentX + 11 + halfWidth, tentBase - 11 + i, PALETTE.olive);
  }
  buf.shadeRows(tentBase - 6, 1.0, 0.8);
  // Entrada oscura de la tienda.
  buf.rect(tentX + 9, tentBase - 6, 5, 6, PALETTE.oliveDark);
  buf.rect(tentX + 10, tentBase - 5, 3, 5, shade(PALETTE.oliveDark, 0.55));

  // --- Sacos terreros (parapeto delantero, a la derecha) ---
  const sandbagX = 46;
  for (let row = 0; row < 3; row++) {
    const y = groundY - 6 - row * 3;
    const offset = row % 2 === 0 ? 0 : 2;
    for (let i = 0; i < 4; i++) {
      const x = sandbagX + offset + i * 5;
      if (x > BASE_W - 5) continue;
      // Cada saco varía un poco de tono: rompe la repetición mecánica.
      const tone = mix(PALETTE.khaki, PALETTE.sand, rng.next());
      buf.ellipse(x + 2, y + 1, 2.6, 1.6, tone);
      buf.hLine(x, x + 4, y + 2, shade(tone, 0.72));
    }
  }

  // --- Cajas de suministros apiladas ---
  buf.rect(18, groundY - 9, 6, 4, PALETTE.brownLight);
  buf.rectOutline(18, groundY - 9, 6, 4, PALETTE.brownDark);
  buf.rect(19, groundY - 13, 5, 4, PALETTE.brown);
  buf.rectOutline(19, groundY - 13, 5, 4, PALETTE.brownDark);
  buf.hLine(20, 22, groundY - 11, PALETTE.khaki);

  buf.outline(PALETTE.outline);
  return buf;
}

/**
 * Puesto de mando vietnamita (objetivo del nivel 1).
 *
 * Lenguaje visual opuesto al estadounidense: bambú, palma seca, tierra y
 * troncos. Nada de lona ni metal — se lee como improvisado y camuflado.
 */
export function drawVcOutpost(rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(BASE_W, BASE_H);
  const groundY = BASE_H - 1;

  // --- Terraplén de tierra ---
  buf.rect(2, groundY - 5, BASE_W - 4, 6, shade(PALETTE.mud, 0.85));
  buf.hLine(2, BASE_W - 3, groundY - 5, PALETTE.mud);

  // --- Cuerpo del búnker: troncos y tierra ---
  const bx = 16;
  const by = groundY - 26;
  buf.rect(bx, by, 34, 21, PALETTE.brownDark);
  // Vetas de los troncos horizontales.
  for (let y = by + 2; y < by + 21; y += 4) {
    buf.hLine(bx, bx + 33, y, shade(PALETTE.brown, 0.9));
    buf.hLine(bx, bx + 33, y + 1, shade(PALETTE.brownDark, 1.15));
  }
  // Tronera: la ranura oscura desde la que dispara la guarnición.
  buf.rect(bx + 8, by + 7, 18, 4, PALETTE.outline);
  buf.hLine(bx + 8, bx + 25, by + 7, shade(PALETTE.brown, 0.5));

  // --- Techo de palma seca ---
  for (let i = 0; i < 7; i++) {
    buf.hLine(bx - 3 + i, bx + 36 - i, by - 7 + i, i < 3 ? PALETTE.khaki : shade(PALETTE.khaki, 0.8));
  }
  // Hojas sueltas del techo: irregularidad que lo hace orgánico.
  for (let i = 0; i < 10; i++) {
    const x = bx - 2 + rng.int(0, 36);
    buf.vLine(x, by - 2, by + rng.int(0, 2), shade(PALETTE.khaki, 0.65));
  }

  // --- Barricada de bambú delantera ---
  const fenceX = bx + 36;
  for (let i = 0; i < 5; i++) {
    const x = fenceX + i * 3;
    if (x > BASE_W - 3) break;
    const top = groundY - 14 - rng.int(0, 3);
    buf.vLine(x, top, groundY - 5, PALETTE.oliveLight);
    buf.set(x, top, shade(PALETTE.oliveLight, 1.3));
    // Nudos del bambú.
    buf.set(x, top + 5, PALETTE.oliveDark);
  }
  // Travesaño que ata la empalizada.
  buf.hLine(fenceX - 1, Math.min(BASE_W - 2, fenceX + 13), groundY - 11, PALETTE.brown);

  // --- Estandarte enemigo: contrapunto rojo a la bandera azul aliada ---
  buf.vLine(bx + 30, by - 16, by - 6, PALETTE.brown);
  buf.rect(bx + 31, by - 16, 6, 4, PALETTE.vcAccent);
  buf.set(bx + 33, by - 15, PALETTE.muzzle);

  buf.outline(PALETTE.outline);
  return buf;
}

/** Búnker reforzado del nivel 2: el puesto, con hormigón y aspilleras. */
export function drawVcBunker(rng: Rng): PixelBuffer {
  const buf = drawVcOutpost(rng);
  const groundY = BASE_H - 1;
  // Refuerzo de hormigón sobre la estructura de troncos.
  buf.rect(14, groundY - 30, 40, 5, PALETTE.steel);
  buf.hLine(14, 53, groundY - 30, PALETTE.steelLight);
  buf.rect(20, groundY - 29, 4, 3, PALETTE.outline);
  buf.rect(30, groundY - 29, 4, 3, PALETTE.outline);
  buf.rect(40, groundY - 29, 4, 3, PALETTE.outline);
  buf.outline(PALETTE.outline);
  return buf;
}

/**
 * Zona de acopio: el punto al que van los recolectores.
 *
 * Cajas lanzadas en paracaídas, con el paño todavía enredado. Es el
 * equivalente temático de la veta de oro de Stick War.
 */
export function drawSupplyDrop(rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(38, 30);
  const groundY = 29;

  // Paracaídas desinflado sobre el suelo.
  buf.ellipse(12, groundY - 10, 11, 6, shade(PALETTE.sand, 0.9));
  buf.ellipse(12, groundY - 9, 10, 5, PALETTE.sand);
  buf.hLine(2, 22, groundY - 5, shade(PALETTE.sand, 0.7));
  // Cuerdas del paracaídas hacia la carga.
  buf.line(6, groundY - 6, 16, groundY - 12, PALETTE.khaki);
  buf.line(20, groundY - 6, 18, groundY - 12, PALETTE.khaki);

  // Pila de cajas de suministros, en varios tonos de madera.
  const crates: readonly [number, number, number, number][] = [
    [16, groundY - 7, 9, 7],
    [25, groundY - 6, 8, 6],
    [19, groundY - 13, 8, 6],
  ];
  for (const [x, y, w, h] of crates) {
    const tone = rng.chance(0.5) ? PALETTE.brown : PALETTE.brownLight;
    buf.rect(x, y, w, h, tone);
    buf.rectOutline(x, y, w, h, PALETTE.brownDark);
    // Fleje metálico de la caja.
    buf.hLine(x + 1, x + w - 2, y + Math.floor(h / 2), PALETTE.khaki);
  }

  buf.outline(PALETTE.outline);
  return buf;
}
