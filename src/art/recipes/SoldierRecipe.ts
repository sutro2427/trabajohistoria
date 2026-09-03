import { PixelBuffer, shade, type Rgba } from '../PixelBuffer.js';
import { PALETTE, type SoldierPalette } from '../palette.js';
import type { Rng } from '../../core/Rng.js';

/**
 * ============================================================================
 * RECETA DEL SOLDADO — un cuerpo, muchas unidades
 * ============================================================================
 *
 * En lugar de escribir a mano una matriz de píxeles por cada frame de cada
 * unidad (cientos de matrices imposibles de mantener), se dibuja UN cuerpo
 * humanoide parametrizado por dos cosas:
 *
 *   · `Pose` — dónde están las partes del cuerpo en este frame concreto.
 *   · `SoldierSkin` — de qué color y con qué equipo se dibuja.
 *
 * Con eso, el soldado estadounidense, el guerrillero vietnamita y el
 * recolector son la misma función con distintos argumentos, y una animación
 * nueva es una función de pose, no un dibujo nuevo.
 *
 * Sistema de coordenadas del lienzo (22×22, el personaje mira a la derecha):
 *
 *      y=1  ─ tocado (casco / sombrero)
 *      y=4  ─ cabeza
 *      y=8  ─ torso
 *      y=15 ─ piernas
 *      y=20 ─ suelo (planta de los pies)
 */

export const SOLDIER_W = 22;
export const SOLDIER_H = 22;

/** Eje central del cuerpo; el arma se proyecta hacia la derecha. */
const CX = 8;
const FOOT_Y = 20;

/** Estado corporal de un frame concreto. Todos los valores en píxeles. */
export interface Pose {
  /** Desplazamiento vertical del torso (respiración, rebote al andar). */
  readonly torsoDY: number;
  /** Desplazamiento vertical extra de la cabeza. */
  readonly headDY: number;
  /** Avance horizontal de la pierna adelantada. */
  readonly frontLegDX: number;
  /** Avance horizontal de la pierna retrasada. */
  readonly backLegDX: number;
  /**
   * Altura del arma: 0 = colgando junto al cuerpo, 1 = horizontal, apuntando.
   * Los valores intermedios producen la transición de encarar el rifle.
   */
  readonly armAim: number;
  /** Retroceso del arma tras el disparo (negativo = hacia atrás). */
  readonly recoil: number;
  /** Inclinación del torso: positivo hacia delante, negativo hacia atrás. */
  readonly lean: number;
  /** Agachado (recolector recogiendo, unidad derribada). 0..1 */
  readonly crouch: number;
  /** Rotación del cuerpo al caer. 0 = de pie, 1 = tumbado. */
  readonly collapse: number;
}

/** Pose neutra; sirve de base para construir el resto con desestructuración. */
export const NEUTRAL_POSE: Pose = Object.freeze({
  torsoDY: 0,
  headDY: 0,
  frontLegDX: 0,
  backLegDX: 0,
  armAim: 0,
  recoil: 0,
  lean: 0,
  crouch: 0,
  collapse: 0,
});

/** Tocado de la unidad: define la silueta y es lo que la identifica de lejos. */
export type Headgear = 'helmet' | 'boonie' | 'conical';

/** Aspecto de la unidad. */
/**
 * Arma que porta la unidad.
 *
 * La silueta del arma es, junto al tocado, lo que permite identificar el tipo
 * de unidad de un vistazo a 22 píxeles de altura. El fusil de francotirador es
 * deliberadamente mucho más largo y lleva mira y bípode: se reconoce al
 * instante incluso en mitad de una línea de combate.
 */
export type WeaponKind = 'rifle' | 'sniper';

export interface SoldierSkin {
  readonly palette: SoldierPalette;
  readonly headgear: Headgear;
  readonly hasBackpack: boolean;
  readonly hasWeapon: boolean;
  /** Tipo de arma. Si se omite, fusil de asalto. */
  readonly weapon?: WeaponKind;
  /** Si carga un saco de suministros (recolector de vuelta a la base). */
  readonly hasSack: boolean;
  /** Cuánta suciedad y desgaste se salpica sobre el uniforme. 0..1 */
  readonly dirtiness: number;
  /** Complexión: 0 = delgado (guerrillero), 1 = corpulento (soldado con chaleco). */
  readonly build: number;
}

/**
 * Dibuja el soldado completo sobre un lienzo nuevo.
 *
 * @param rng Generador sembrado: la suciedad debe ser aleatoria pero
 *            reproducible, para que los sprites sean idénticos en cada
 *            ejecución y los tests de regresión de arte funcionen.
 */
export function drawSoldier(pose: Pose, skin: SoldierSkin, rng: Rng): PixelBuffer {
  const buf = new PixelBuffer(SOLDIER_W, SOLDIER_H);
  const p = skin.palette;

  // El colapso al morir se resuelve dibujando el cuerpo caído: una silueta
  // horizontal es mucho más legible a esta escala que rotar el sprite de pie.
  if (pose.collapse > 0.55) {
    drawFallen(buf, skin, pose.collapse);
    finish(buf, skin, rng);
    return buf;
  }

  const sink = Math.round(pose.crouch * 3 + pose.collapse * 4);
  const lean = Math.round(pose.lean);
  const torsoY = 8 + pose.torsoDY + sink;
  const headY = 4 + pose.torsoDY + pose.headDY + sink;
  const wide = skin.build > 0.5;

  drawLegs(buf, p, pose, sink);
  if (skin.hasBackpack) drawBackpack(buf, p, torsoY, lean);
  drawTorso(buf, p, torsoY, lean, wide);
  if (skin.hasSack) drawSack(buf, torsoY, lean);
  drawHead(buf, p, headY, lean);
  drawHeadgear(buf, p, skin.headgear, headY, lean);
  if (skin.hasWeapon) {
    if (skin.weapon === 'sniper') drawSniperRifle(buf, p, pose, torsoY, lean);
    else drawRifle(buf, p, pose, torsoY, lean);
  } else {
    drawEmptyArms(buf, p, pose, torsoY, lean);
  }

  finish(buf, skin, rng);
  return buf;
}

// ---------------------------------------------------------------------------
// Partes del cuerpo
// ---------------------------------------------------------------------------

function drawLegs(buf: PixelBuffer, p: SoldierPalette, pose: Pose, sink: number): void {
  const top = 15 + sink;
  const bottom = FOOT_Y - Math.round(pose.crouch * 2);
  const boot = shade(p.uniformShade, 0.7);

  // Pierna retrasada, en tono oscuro: separa visualmente las dos piernas.
  const backX = CX - 1 + Math.round(pose.backLegDX);
  buf.rect(backX, top, 2, bottom - top, p.uniformShade);
  buf.rect(backX - (pose.backLegDX < 0 ? 1 : 0), bottom, 3, 1, boot);

  // Pierna adelantada, en tono claro.
  const frontX = CX + 1 + Math.round(pose.frontLegDX);
  buf.rect(frontX, top, 2, bottom - top, p.uniform);
  buf.rect(frontX - (pose.frontLegDX < 0 ? 1 : 0), bottom, 3, 1, boot);
}

function drawTorso(buf: PixelBuffer, p: SoldierPalette, y: number, lean: number, wide: boolean): void {
  const w = wide ? 6 : 5;
  const x = CX - 2 + lean;
  buf.rect(x, y, w, 7, p.uniform);
  // Costado en sombra: volumen con una sola línea.
  buf.vLine(x, y, y + 6, p.uniformShade);
  // Correaje del equipo cruzando el pecho.
  buf.hLine(x, x + w - 1, y + 3, p.gear);
  buf.set(x + w - 2, y + 3, p.accent);
  // Cuello.
  buf.rect(CX - 1 + lean, y - 1, 2, 1, p.skinShade);
}

function drawHead(buf: PixelBuffer, p: SoldierPalette, y: number, lean: number): void {
  const x = CX - 2 + lean;
  buf.rect(x, y, 5, 4, p.skin);
  // Mandíbula y sien en sombra.
  buf.hLine(x, x + 4, y + 3, p.skinShade);
  buf.vLine(x, y, y + 3, p.skinShade);
  // Ojo: un único píxel oscuro que marca hacia dónde mira.
  buf.set(x + 3, y + 1, PALETTE.outline);
}

function drawHeadgear(
  buf: PixelBuffer,
  p: SoldierPalette,
  kind: Headgear,
  headY: number,
  lean: number,
): void {
  const x = CX - 2 + lean;
  switch (kind) {
    case 'helmet': {
      // Casco M1: cúpula ancha con ala corta al frente.
      buf.rect(x - 1, headY - 2, 7, 2, p.uniformShade);
      buf.rect(x, headY - 3, 5, 1, p.uniformShade);
      buf.hLine(x - 1, x + 5, headY, shade(p.uniformShade, 0.6));
      buf.set(x + 4, headY - 2, p.accent);
      break;
    }
    case 'boonie': {
      // Gorro de selva: ala flexible, silueta más blanda.
      buf.rect(x - 1, headY - 2, 7, 2, p.gear);
      buf.hLine(x - 2, x + 6, headY, shade(p.gear, 0.65));
      break;
    }
    case 'conical': {
      // Sombrero cónico: la silueta triangular identifica al bando enemigo
      // de un vistazo, incluso a 22 píxeles de altura.
      const straw = PALETTE.khaki;
      buf.set(x + 2, headY - 4, straw);
      buf.hLine(x + 1, x + 3, headY - 3, straw);
      buf.hLine(x, x + 4, headY - 2, straw);
      buf.hLine(x - 2, x + 6, headY - 1, straw);
      buf.hLine(x - 2, x + 6, headY, shade(straw, 0.6));
      break;
    }
  }
}

function drawBackpack(buf: PixelBuffer, p: SoldierPalette, torsoY: number, lean: number): void {
  const x = CX - 4 + lean;
  buf.rect(x, torsoY + 1, 2, 5, p.gear);
  buf.vLine(x, torsoY + 1, torsoY + 5, shade(p.gear, 0.7));
}

function drawSack(buf: PixelBuffer, torsoY: number, lean: number): void {
  // Saco de suministros al hombro: la señal visual de "vuelvo cargado".
  const x = CX - 5 + lean;
  buf.ellipse(x + 2, torsoY + 2, 2.5, 3, PALETTE.sand);
  buf.hLine(x, x + 4, torsoY + 4, shade(PALETTE.sand, 0.7));
  buf.set(x + 2, torsoY - 1, PALETTE.brown);
}

/**
 * Rifle y brazos.
 *
 * `armAim` interpola entre el arma colgando (0) y encarada horizontal (1),
 * y `recoil` la desplaza hacia atrás en el frame del disparo. Con esos dos
 * números salen las animaciones de espera, apuntar y disparar.
 */
function drawRifle(
  buf: PixelBuffer,
  p: SoldierPalette,
  pose: Pose,
  torsoY: number,
  lean: number,
): void {
  const shoulderX = CX + 2 + lean;
  const shoulderY = torsoY + 2;

  // De colgando a horizontal: la mano sube y el arma se adelanta.
  const handX = shoulderX + Math.round(1 + pose.armAim * 3 + pose.recoil);
  const handY = shoulderY + Math.round(3 - pose.armAim * 2);

  // Brazo de dos píxeles de grosor: a esta escala uno solo se pierde contra
  // el fondo y el arma acaba pareciendo que flota separada del cuerpo.
  buf.line(shoulderX, shoulderY, handX, handY, p.uniform);
  buf.line(shoulderX, shoulderY + 1, handX, handY + 1, p.uniformShade);

  // --- Arma ---
  const stockWood = shade(p.weapon, 2.1);
  const barrelLen = 5 + Math.round(pose.armAim * 3);
  const barrelY = handY - Math.round(pose.armAim);

  // Culata y guardamanos de madera, por detrás de la mano y apoyados en el hombro.
  const stockX = handX - 4;
  buf.rect(stockX, barrelY, 4, 2, stockWood);
  buf.hLine(stockX, stockX + 3, barrelY + 1, shade(stockWood, 0.7));

  // Cañón: dos píxeles de alto en la parte del cajón, uno en la boca, para que
  // se lea como un arma con volumen y no como un palo.
  buf.rect(handX, barrelY, barrelLen - 2, 2, p.weapon);
  buf.hLine(handX + barrelLen - 2, handX + barrelLen, barrelY, p.weapon);
  // Brillo superior del cañón.
  buf.hLine(handX, handX + barrelLen - 3, barrelY, shade(p.weapon, 1.6));

  // Cargador curvo bajo el cajón de mecanismos.
  buf.vLine(handX + 1, barrelY + 2, barrelY + 3, p.weapon);
  buf.set(handX + 2, barrelY + 3, p.weapon);

  // Mano agarrando el guardamanos: se dibuja al final para que quede encima.
  buf.set(handX, handY, p.skin);
  buf.set(handX - 1, handY, p.skinShade);
}

/**
 * Fusil de francotirador: cañón largo, mira telescópica y bípode.
 *
 * Se dibuja como una pieza distinta y no como un rifle estirado porque a esta
 * escala la silueta lo es todo: el jugador tiene que poder distinguir a sus
 * tiradores dentro de una formación sin fijarse, y el perfil largo con la
 * mira encima lo consigue de inmediato.
 */
function drawSniperRifle(
  buf: PixelBuffer,
  p: SoldierPalette,
  pose: Pose,
  torsoY: number,
  lean: number,
): void {
  const shoulderX = CX + 2 + lean;
  const shoulderY = torsoY + 2;

  const handX = shoulderX + Math.round(1 + pose.armAim * 3 + pose.recoil);
  const handY = shoulderY + Math.round(3 - pose.armAim * 2);

  // Brazo de dos píxeles, igual que en el fusil normal.
  buf.line(shoulderX, shoulderY, handX, handY, p.uniform);
  buf.line(shoulderX, shoulderY + 1, handX, handY + 1, p.uniformShade);

  const barrelY = handY - Math.round(pose.armAim);
  // Cañón claramente más largo que el del fusil de asalto (9 px frente a 5-8).
  const barrelLen = 9 + Math.round(pose.armAim * 2);
  const stockWood = shade(p.weapon, 1.9);

  // Culata larga de madera, apoyada en el hombro.
  buf.rect(handX - 5, barrelY, 5, 2, stockWood);
  buf.hLine(handX - 5, handX - 1, barrelY + 1, shade(stockWood, 0.65));

  // Cañón con guardamanos.
  buf.rect(handX, barrelY, barrelLen - 3, 2, p.weapon);
  buf.hLine(handX + barrelLen - 3, handX + barrelLen, barrelY, p.weapon);
  buf.hLine(handX, handX + barrelLen - 4, barrelY, shade(p.weapon, 1.7));

  // Mira telescópica: el rasgo que identifica al arma.
  buf.rect(handX - 1, barrelY - 2, 5, 1, shade(p.weapon, 0.7));
  buf.set(handX - 2, barrelY - 2, PALETTE.steelLight);
  buf.set(handX + 4, barrelY - 2, PALETTE.steelLight);
  // Montura que une la mira al cañón.
  buf.set(handX, barrelY - 1, p.weapon);
  buf.set(handX + 3, barrelY - 1, p.weapon);

  // Bípode desplegado bajo el cañón, solo al apuntar.
  if (pose.armAim > 0.6) {
    const bipodX = handX + barrelLen - 4;
    buf.line(bipodX, barrelY + 2, bipodX - 2, barrelY + 5, PALETTE.steelDark);
    buf.line(bipodX, barrelY + 2, bipodX + 2, barrelY + 5, PALETTE.steelDark);
  }

  // Mano sobre el guardamanos.
  buf.set(handX, handY, p.skin);
  buf.set(handX - 1, handY, p.skinShade);
}

/** Brazos sin arma: el recolector los usa para cargar y para acarrear. */
function drawEmptyArms(
  buf: PixelBuffer,
  p: SoldierPalette,
  pose: Pose,
  torsoY: number,
  lean: number,
): void {
  const shoulderX = CX + 2 + lean;
  const shoulderY = torsoY + 2;
  // Al agacharse los brazos se extienden hacia el suelo, hacia la carga.
  const handX = shoulderX + Math.round(1 + pose.crouch * 2);
  const handY = shoulderY + Math.round(3 + pose.crouch * 2 - pose.armAim * 3);
  buf.line(shoulderX, shoulderY, handX, handY, p.uniform);
  buf.set(handX, handY, p.skin);
}

/** Cuerpo tendido en el suelo: el último frame de la animación de muerte. */
function drawFallen(buf: PixelBuffer, skin: SoldierSkin, collapse: number): void {
  const p = skin.palette;
  const y = FOOT_Y - 2;
  const alpha = collapse >= 1 ? 1 : 0.9;

  buf.rect(CX - 4, y, 9, 3, p.uniform);
  buf.hLine(CX - 4, CX + 4, y + 2, p.uniformShade);
  // Cabeza caída hacia atrás.
  buf.ellipse(CX - 5, y + 1, 2, 1.8, p.skin);
  // Piernas extendidas.
  buf.rect(CX + 4, y + 1, 4, 2, p.uniformShade);
  if (skin.hasWeapon) buf.hLine(CX - 1, CX + 5, y - 1, p.weapon);
  // Charco de sangre bajo el cuerpo.
  buf.hLine(CX - 5, CX + 3, y + 3, PALETTE.bloodDark);
  if (alpha < 1) buf.mapColors((c) => ({ ...c, a: Math.round(c.a * alpha) }));
}

// ---------------------------------------------------------------------------
// Acabado común a todas las poses
// ---------------------------------------------------------------------------

/** Suciedad, sombreado vertical y contorno: lo que convierte el dibujo en pixel art. */
function finish(buf: PixelBuffer, skin: SoldierSkin, rng: Rng): void {
  if (skin.dirtiness > 0) {
    // El barro se acumula abajo: se salpica un color semitransparente y luego
    // se refuerzan las piernas, que es donde la suciedad se nota de verdad.
    const mud: Rgba = { ...PALETTE.mud, a: 150 };
    buf.speckle(rng, mud, skin.dirtiness * 0.28);
  }
  // Luz cenital: la mitad inferior del cuerpo queda algo más oscura.
  buf.shadeRows(13, 1.0, 0.82);
  buf.outline(PALETTE.outline);
}
