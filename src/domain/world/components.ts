import type { ClipName } from '../../art/AnimationCatalog.js';

/**
 * Componentes de las entidades.
 *
 * Se opta por composición en lugar de una jerarquía `Unidad → Soldado → Tanque`.
 * Razón concreta: el tanque no camina como la infantería, tiene armadura, hace
 * daño en área y no se tambalea al recibir impactos. Con herencia habría que
 * reabrir la clase base para cada excepción —violando el Principio
 * Abierto/Cerrado— y algunos hijos dejarían de ser sustituibles por el padre
 * (violando Liskov). Con componentes, cada sistema se limita a las entidades
 * que llevan el componente que le concierne.
 *
 * Son structs de datos planos, sin métodos: la lógica vive en los sistemas.
 */

/** Posición y orientación. */
export interface Transform {
  x: number;
  y: number;
  /**
   * Posición en el paso anterior. El render interpola entre ambas para que el
   * movimiento sea fluido aunque la simulación vaya a 60 Hz fijos.
   */
  prevX: number;
  prevY: number;
  /** Hacia dónde mira: 1 = derecha, -1 = izquierda. */
  facing: 1 | -1;
}

/** Vida y resistencia. */
export interface Health {
  hp: number;
  readonly maxHp: number;
  readonly armor: number;
  /** Segundos restantes de aturdimiento por impacto. */
  flinchTimer: number;
  /** Segundos hasta poder volver a aturdirse (evita el bloqueo por fuego sostenido). */
  flinchCooldown: number;
}

/** Estado del arma. */
export interface Combat {
  /** Segundos hasta poder disparar de nuevo. */
  cooldown: number;
  /** Segundos apuntando acumulados desde que se fijó el blanco. */
  aimTimer: number;
  /** Identificador de la entidad enemiga elegida como blanco, o 0 si no hay. */
  targetId: number;
  /** `true` si el blanco es una estructura y no una unidad. */
  targetIsStructure: boolean;
}

/** Fases del ciclo de recolección. */
export type HarvestPhase = 'toNode' | 'gathering' | 'returning' | 'depositing';

/** Estado del recolector. */
export interface HarvesterState {
  phase: HarvestPhase;
  /** Suministros que lleva encima. */
  carried: number;
  /** Temporizador de la fase actual. */
  timer: number;
  /** Coordenada X de la zona de acopio asignada. */
  nodeX: number;
  /** Coordenada X del punto de entrega (la base). */
  depotX: number;
}

/** Estado de la animación en curso. */
export interface AnimState {
  clip: ClipName;
  /** Fotograma actual dentro del clip. */
  frame: number;
  /** Segundos acumulados en el fotograma actual. */
  timer: number;
  /** `true` cuando un clip no cíclico ha llegado al final. */
  finished: boolean;
  /**
   * `true` si el fotograma con evento ya se disparó en esta reproducción.
   * Impide que un mismo disparo se emita dos veces.
   */
  eventFired: boolean;
}

/** Crea una animación en su estado inicial. */
export function newAnim(clip: ClipName): AnimState {
  return { clip, frame: 0, timer: 0, finished: false, eventFired: false };
}

/** Reinicia la animación a un clip nuevo. No hace nada si ya es el activo. */
export function setClip(anim: AnimState, clip: ClipName): void {
  if (anim.clip === clip) return;
  anim.clip = clip;
  anim.frame = 0;
  anim.timer = 0;
  anim.finished = false;
  anim.eventFired = false;
}
