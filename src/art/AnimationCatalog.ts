import { NEUTRAL_POSE, type Pose } from './recipes/SoldierRecipe.js';

/**
 * Catálogo de animaciones.
 *
 * Una animación aquí no es una lista de dibujos, sino una **función de pose**:
 * dado el número de frame devuelve dónde está cada parte del cuerpo. Añadir
 * una animación cuesta cinco líneas y no requiere dibujar nada.
 *
 * `eventFrame` es la clave de que el juego se sienta bien: marca el frame
 * exacto en el que la acción "ocurre" (sale la bala, se suelta la carga), de
 * modo que el efecto visual y el efecto de simulación coinciden en el tiempo.
 */

/** Identificadores de los clips disponibles. */
export type ClipName =
  | 'idle'
  | 'walk'
  | 'aim'
  | 'shoot'
  | 'hit'
  | 'die'
  | 'harvest'
  | 'carry';

export interface AnimClip {
  readonly name: ClipName;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  /** Frame en el que se dispara el efecto asociado (bala, entrega de carga). */
  readonly eventFrame?: number;
  /** Pose correspondiente a un frame. */
  pose(frame: number): Pose;
}

/** Construye una pose a partir de la neutra, sobrescribiendo lo que cambie. */
function poseOf(overrides: Partial<Pose>): Pose {
  return { ...NEUTRAL_POSE, ...overrides };
}

/** Espera: respiración de un píxel, arma baja. Dos frames bastan. */
const IDLE: AnimClip = {
  name: 'idle',
  frames: 2,
  fps: 2.5,
  loop: true,
  pose: (f) => poseOf({ torsoDY: f === 0 ? 0 : -1, headDY: f === 0 ? 0 : -1, armAim: 0.15 }),
};

/**
 * Caminar: ciclo de seis frames.
 *
 * Las piernas se cruzan en oposición y el torso rebota un píxel en los pasos
 * de apoyo. Ese rebote sincronizado con el paso es lo que hace que la marcha
 * se lea como marcha y no como un deslizamiento.
 */
const WALK: AnimClip = {
  name: 'walk',
  frames: 6,
  fps: 10,
  loop: true,
  pose: (f) => {
    const swing = [2, 1, 0, -2, -1, 0][f] ?? 0;
    const bounce = f === 1 || f === 4 ? -1 : 0;
    return poseOf({
      frontLegDX: swing,
      backLegDX: -swing,
      torsoDY: bounce,
      headDY: bounce,
      armAim: 0.2,
      lean: 1,
    });
  },
};

/** Apuntar: el arma sube a la horizontal y el cuerpo se estabiliza. */
const AIM: AnimClip = {
  name: 'aim',
  frames: 2,
  fps: 8,
  loop: true,
  pose: (f) => poseOf({ armAim: f === 0 ? 0.85 : 1, torsoDY: f === 0 ? 0 : -1 }),
};

/**
 * Disparar: cuatro frames.
 *   0 — arma encarada, instante previo
 *   1 — DISPARO: retroceso máximo (aquí sale la bala)
 *   2 — el arma vuelve
 *   3 — recuperada
 */
const SHOOT: AnimClip = {
  name: 'shoot',
  frames: 4,
  fps: 14,
  loop: false,
  eventFrame: 1,
  pose: (f) => {
    const recoil = [0, -2, -1, 0][f] ?? 0;
    return poseOf({ armAim: 1, recoil, lean: f === 1 ? -1 : 0 });
  },
};

/** Impacto recibido: el cuerpo se echa hacia atrás y se encoge. */
const HIT: AnimClip = {
  name: 'hit',
  frames: 2,
  fps: 12,
  loop: false,
  pose: (f) => poseOf({ lean: -2, torsoDY: 1, headDY: 1, armAim: f === 0 ? 0.5 : 0.2 }),
};

/** Muerte: colapso progresivo hasta quedar tendido. */
const DIE: AnimClip = {
  name: 'die',
  frames: 5,
  fps: 8,
  loop: false,
  pose: (f) => {
    const collapse = f / 4;
    return poseOf({
      collapse,
      crouch: Math.min(1, collapse * 1.6),
      lean: -Math.round(collapse * 3),
      armAim: 0,
    });
  },
};

/**
 * Recolectar: el recolector se agacha, carga y se incorpora.
 * En el frame 2 (`eventFrame`) es cuando se suma la carga.
 */
const HARVEST: AnimClip = {
  name: 'harvest',
  frames: 4,
  fps: 6,
  loop: true,
  eventFrame: 2,
  pose: (f) => {
    const crouch = [0.3, 0.8, 1, 0.5][f] ?? 0;
    return poseOf({ crouch, lean: 1, torsoDY: Math.round(crouch), armAim: 0.1 });
  },
};

/** Caminar cargado: el mismo ciclo, más pesado y algo encorvado. */
const CARRY: AnimClip = {
  name: 'carry',
  frames: 6,
  fps: 8,
  loop: true,
  pose: (f) => {
    const swing = [1, 1, 0, -1, -1, 0][f] ?? 0;
    return poseOf({
      frontLegDX: swing,
      backLegDX: -swing,
      torsoDY: f === 1 || f === 4 ? 0 : 1,
      lean: 2,
      crouch: 0.2,
    });
  },
};

export const CLIPS: Readonly<Record<ClipName, AnimClip>> = Object.freeze({
  idle: IDLE,
  walk: WALK,
  aim: AIM,
  shoot: SHOOT,
  hit: HIT,
  die: DIE,
  harvest: HARVEST,
  carry: CARRY,
});

/** Duración total de un clip, en segundos. */
export function clipDuration(clip: AnimClip): number {
  return clip.frames / clip.fps;
}

export function getClip(name: ClipName): AnimClip {
  return CLIPS[name];
}
