import { PixelBuffer, mix, shade } from '../PixelBuffer.js';
import { PALETTE } from '../palette.js';
import type { Rng } from '../../core/Rng.js';

/**
 * Elementos sueltos que pueblan el campo de batalla: barricadas, vegetación,
 * cráteres y restos. Se siembran a lo largo del mapa para que el trayecto
 * entre las dos bases tenga puntos de referencia y no sea un pasillo vacío.
 */

/** Parapeto de sacos terreros. Marca posiciones defensivas. */
export function drawSandbagWall(rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(26, 14);
  const groundY = 13;
  for (let row = 0; row < 3; row++) {
    const y = groundY - 3 - row * 3;
    const offset = row % 2 === 0 ? 0 : 2;
    const count = 5 - row;
    for (let i = 0; i < count; i++) {
      const x = offset + i * 5;
      const tone = mix(PALETTE.khaki, PALETTE.sand, rng.next());
      buf.ellipse(x + 2, y + 1, 2.6, 1.6, tone);
      buf.hLine(x, x + 4, y + 2, shade(tone, 0.7));
    }
  }
  buf.outline(PALETTE.outline);
  return buf;
}

/** Barricada de bambú clavada en el suelo. Vocabulario visual del bando enemigo. */
export function drawBambooBarricade(rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(22, 18);
  const groundY = 17;
  for (let i = 0; i < 7; i++) {
    const x = 1 + i * 3;
    const top = groundY - 9 - rng.int(0, 5);
    buf.vLine(x, top, groundY, PALETTE.oliveLight);
    buf.set(x, top, shade(PALETTE.oliveLight, 1.35));
    // Nudos característicos de la caña.
    for (let k = top + 4; k < groundY; k += 5) buf.set(x, k, PALETTE.oliveDark);
  }
  // Ataduras horizontales.
  buf.hLine(1, 20, groundY - 6, PALETTE.brown);
  buf.hLine(1, 20, groundY - 2, PALETTE.brown);
  buf.outline(PALETTE.outline);
  return buf;
}

/** Palmera aislada, para dar escala y romper la línea del horizonte. */
export function drawPalmTree(rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(30, 46);
  const groundY = 45;
  const trunkH = rng.int(26, 34);
  const bend = rng.range(-3, 3);

  // Tronco curvado con anillos.
  for (let i = 0; i < trunkH; i++) {
    const t = i / trunkH;
    const x = Math.round(15 + bend * t * t);
    const y = groundY - i;
    buf.rect(x, y, 2, 1, i % 4 === 0 ? shade(PALETTE.brown, 1.2) : PALETTE.brownDark);
  }

  // Corona de hojas: cada fronda es un arco descendente con foliolos.
  const topX = Math.round(15 + bend);
  const topY = groundY - trunkH;
  const fronds = rng.int(6, 8);
  for (let f = 0; f < fronds; f++) {
    const angle = (f / fronds) * Math.PI * 2;
    const dirX = Math.cos(angle);
    const len = rng.range(8, 13);
    const tone = f % 2 === 0 ? PALETTE.jungleLight : PALETTE.jungleMid;
    let px = topX;
    let py = topY;
    for (let s = 0; s < len; s++) {
      px += dirX;
      // La hoja se arquea: sube al principio y cae al final.
      py += -0.55 + s * 0.14;
      buf.set(Math.round(px), Math.round(py), tone);
      if (s % 2 === 0) buf.set(Math.round(px), Math.round(py) + 1, shade(tone, 0.75));
    }
  }
  // Cocos bajo la corona.
  buf.set(topX - 1, topY + 2, PALETTE.brownDark);
  buf.set(topX + 2, topY + 3, PALETTE.brownDark);

  buf.outline(PALETTE.outline);
  return buf;
}

/** Arbusto bajo de la maleza. El relleno barato del escenario. */
export function drawBush(rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(18, 12);
  const groundY = 11;
  const blobs = rng.int(3, 5);
  for (let i = 0; i < blobs; i++) {
    const cx = rng.int(4, 14);
    const cy = groundY - rng.int(2, 5);
    const tone = rng.chance(0.5) ? PALETTE.jungleMid : PALETTE.jungleLight;
    buf.ellipse(cx, cy, rng.range(3, 5), rng.range(2, 3.5), tone);
  }
  buf.shadeRows(6, 1.0, 0.75);
  buf.outline(PALETTE.outline);
  return buf;
}

/** Cráter de artillería: cicatriz de un combate anterior. */
export function drawCrater(rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(24, 9);
  const dirt = shade(PALETTE.mud, 0.7);
  buf.ellipse(12, 6, 11, 3.5, dirt);
  buf.ellipse(12, 5, 8, 2.2, shade(dirt, 0.65));
  // Tierra levantada en el borde.
  for (let i = 0; i < 12; i++) {
    const x = rng.int(1, 22);
    buf.set(x, 2 + rng.int(0, 1), shade(PALETTE.mud, 1.2));
  }
  return buf;
}

/** Tocón quemado: rastro de defoliación, coherente con el escenario histórico. */
export function drawBurntStump(rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(12, 14);
  const groundY = 13;
  const h = rng.int(6, 10);
  buf.rect(4, groundY - h, 4, h, PALETTE.brownDark);
  buf.vLine(4, groundY - h, groundY, shade(PALETTE.outline, 1.6));
  // Astillas de la copa arrancada.
  buf.set(3, groundY - h - 1, PALETTE.brownDark);
  buf.set(8, groundY - h - 2, PALETTE.brownDark);
  buf.outline(PALETTE.outline);
  return buf;
}
