import { PixelBuffer, shade, mix, type Rgba } from '../PixelBuffer.js';
import { PALETTE } from '../palette.js';
import type { Rng } from '../../core/Rng.js';

/**
 * ============================================================================
 * TANQUE — el sprite que faltaba
 * ============================================================================
 *
 * Los tanques existían en el catálogo de balance desde el principio, pero
 * nunca se llegó a dibujar ninguno: al construir uno no habría aparecido nada
 * en pantalla.
 *
 * A diferencia de la infantería, el tanque no reutiliza el cuerpo humanoide
 * —no tiene piernas ni poses— así que necesita su propia receta. Sus
 * "animaciones" son las cadenas rodando y el retroceso del cañón.
 *
 * La silueta busca leerse de inmediato junto a un soldado de 22 px: casco
 * bajo y ancho, cadenas visibles y un cañón largo que sobresale del chasis.
 */

export const TANK_W = 40;
export const TANK_H = 24;

/** Aspecto del blindado. Cambiarlo genera el del otro bando. */
export interface TankSkin {
  readonly hull: Rgba;
  readonly hullShade: Rgba;
  readonly turret: Rgba;
  readonly accent: Rgba;
  /** Suciedad y desgaste del casco. 0..1 */
  readonly dirtiness: number;
}

export const US_TANK_SKIN: TankSkin = Object.freeze({
  hull: PALETTE.olive,
  hullShade: PALETTE.oliveDark,
  turret: mix(PALETTE.olive, PALETTE.oliveLight, 0.4),
  accent: PALETTE.usAccent,
  dirtiness: 0.3,
});

export const VC_TANK_SKIN: TankSkin = Object.freeze({
  hull: mix(PALETTE.olive, PALETTE.steel, 0.45),
  hullShade: PALETTE.steelDark,
  turret: mix(PALETTE.steel, PALETTE.oliveDark, 0.4),
  accent: PALETTE.vcAccent,
  dirtiness: 0.45,
});

/** Estado del blindado en un fotograma. */
export interface TankPose {
  /** Fase de rodadura de las cadenas (0..3): desplaza los eslabones. */
  readonly trackPhase: number;
  /** Retroceso del cañón al disparar, en píxeles (negativo = hacia atrás). */
  readonly recoil: number;
  /** Balanceo vertical del casco sobre la suspensión. */
  readonly bounce: number;
  /** Destrucción: 0 intacto, 1 chatarra ardiendo. */
  readonly wreck: number;
}

export const TANK_NEUTRAL: TankPose = Object.freeze({
  trackPhase: 0,
  recoil: 0,
  bounce: 0,
  wreck: 0,
});

/** Dibuja el tanque completo mirando a la derecha. */
export function drawTank(pose: TankPose, skin: TankSkin, rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(TANK_W, TANK_H);
  const groundY = TANK_H - 1;

  if (pose.wreck > 0.55) {
    drawWreck(buf, skin, groundY);
    finishTank(buf, skin, rng);
    return buf;
  }

  const bounce = Math.round(pose.bounce);
  const hullTop = groundY - 13 + bounce;

  drawTracks(buf, groundY, pose.trackPhase);
  drawHull(buf, skin, hullTop, groundY);
  drawTurret(buf, skin, hullTop, pose.recoil);

  finishTank(buf, skin, rng);
  return buf;
}

/** Cadenas: dos ruedas grandes, ruedas de rodadura y eslabones. */
function drawTracks(buf: PixelBuffer, groundY: number, phase: number): void {
  const top = groundY - 6;
  const left = 3;
  const right = TANK_W - 4;

  // Banda de rodadura.
  buf.rect(left, top, right - left, 6, PALETTE.steelDark);
  buf.hLine(left, right - 1, top, PALETTE.steel);

  // Eslabones: se desplazan con la fase para que la cadena parezca girar.
  // Es toda la animación de movimiento que necesita un vehículo a esta escala.
  for (let x = left + (phase % 3); x < right; x += 3) {
    buf.vLine(x, top + 1, groundY - 1, shade(PALETTE.steelDark, 0.6));
  }

  // Ruedas motrices en los extremos y ruedas de rodadura intermedias.
  buf.ellipse(left + 3, groundY - 3, 3, 3, PALETTE.steel);
  buf.ellipse(right - 3, groundY - 3, 3, 3, PALETTE.steel);
  buf.ellipse(left + 3, groundY - 3, 1.4, 1.4, PALETTE.steelDark);
  buf.ellipse(right - 3, groundY - 3, 1.4, 1.4, PALETTE.steelDark);
  for (let x = left + 9; x < right - 6; x += 6) {
    buf.ellipse(x, groundY - 3, 2, 2, shade(PALETTE.steel, 0.85));
  }
}

/** Casco: cuerpo bajo con glacis inclinado al frente. */
function drawHull(buf: PixelBuffer, skin: TankSkin, top: number, groundY: number): void {
  const left = 4;
  const right = TANK_W - 5;
  const bottom = groundY - 5;

  buf.rect(left, top, right - left, bottom - top, skin.hull);
  // Glacis: el frente se inclina, que es lo que da lectura de "blindado".
  for (let i = 0; i < 4; i++) {
    buf.vLine(right - 1 + i - 3, top + i, bottom, skin.hull);
    buf.set(right - 4 + i, top + i, shade(skin.hull, 1.25));
  }
  // Sombra bajo el casco y brillo superior.
  buf.hLine(left, right - 1, bottom - 1, skin.hullShade);
  buf.hLine(left, right - 5, top, shade(skin.hull, 1.3));
  // Guardabarros sobre las cadenas.
  buf.hLine(left - 1, right, bottom, skin.hullShade);
  // Marca de identificación del bando.
  buf.rect(left + 3, top + 2, 3, 2, skin.accent);
}

/** Torreta y cañón. El retroceso desplaza el tubo hacia atrás al disparar. */
function drawTurret(buf: PixelBuffer, skin: TankSkin, hullTop: number, recoil: number): void {
  const cx = 15;
  const turretTop = hullTop - 5;

  // Torreta redondeada.
  buf.ellipse(cx, turretTop + 3, 7, 4, skin.turret);
  buf.rect(cx - 7, turretTop + 3, 14, 3, skin.turret);
  buf.hLine(cx - 6, cx + 6, turretTop, shade(skin.turret, 1.25));
  buf.hLine(cx - 7, cx + 7, turretTop + 5, skin.hullShade);

  // Escotilla del comandante.
  buf.rect(cx - 3, turretTop, 4, 1, shade(skin.turret, 0.7));

  // Cañón: largo y grueso, con freno de boca en la punta.
  const barrelY = turretTop + 2;
  const barrelStart = cx + 6 + Math.round(recoil);
  const barrelEnd = TANK_W - 2 + Math.round(recoil);
  buf.rect(barrelStart, barrelY, barrelEnd - barrelStart, 2, PALETTE.steel);
  buf.hLine(barrelStart, barrelEnd, barrelY, PALETTE.steelLight);
  buf.rect(barrelEnd - 2, barrelY - 1, 3, 4, PALETTE.steelDark);

  // Ametralladora coaxial sobre la torreta.
  buf.hLine(cx - 1, cx + 3, turretTop - 1, PALETTE.gunmetal);
}

/** Chatarra ardiendo: el último fotograma de la destrucción. */
function drawWreck(buf: PixelBuffer, skin: TankSkin, groundY: number): void {
  const burnt = shade(skin.hullShade, 0.45);
  // Casco hundido y ennegrecido.
  buf.rect(4, groundY - 7, TANK_W - 9, 7, burnt);
  buf.rect(3, groundY - 3, TANK_W - 7, 3, PALETTE.steelDark);
  // Torreta desprendida, volcada a un lado.
  buf.ellipse(11, groundY - 9, 5, 3, burnt);
  // Cañón caído apuntando al suelo.
  buf.line(15, groundY - 9, 26, groundY - 2, PALETTE.steelDark);
  // Brasas.
  buf.set(9, groundY - 8, PALETTE.muzzle);
  buf.set(18, groundY - 6, PALETTE.blood);
  buf.set(22, groundY - 9, PALETTE.muzzle);
}

/** Acabado común: suciedad, sombreado y contorno. */
function finishTank(buf: PixelBuffer, skin: TankSkin, rng: Rng): void {
  if (skin.dirtiness > 0) {
    buf.speckle(rng, { ...PALETTE.mud, a: 130 }, skin.dirtiness * 0.22);
  }
  buf.shadeRows(Math.floor(TANK_H * 0.55), 1.0, 0.82);
  buf.outline(PALETTE.outline);
}
