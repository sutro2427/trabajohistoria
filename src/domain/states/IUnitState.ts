import type { EventBus } from '../../core/EventBus.js';
import type { UnitDef } from '../balance/types.js';
import type { GameEvents } from '../events.js';
import type { Entity } from '../world/Entity.js';
import type { World } from '../world/World.js';

/**
 * ============================================================================
 * PATRÓN STATE — comportamiento autónomo de las unidades
 * ============================================================================
 *
 * Cada unidad se gobierna a sí misma mediante una máquina de estados. Eso es
 * lo que produce la sensación de Stick War: el jugador da una orden de postura
 * al ejército entero y cada soldado decide por su cuenta cuándo avanzar,
 * cuándo detenerse, a quién disparar y cuándo replegarse.
 *
 * Detalle de rendimiento importante: las instancias de estado son
 * **compartidas por todas las unidades y no guardan estado mutable**. Lo que
 * cambia (temporizadores, blanco actual) vive en la entidad. Así se evita
 * crear objetos en cada transición, con cientos de transiciones por segundo.
 */

/** Estados posibles de una unidad. */
export type StateId =
  // Comunes a toda unidad
  | 'idle'
  | 'move'
  | 'engage'
  | 'attack'
  | 'hit'
  | 'die'
  // Exclusivos del recolector
  | 'toNode'
  | 'gathering'
  | 'returning'
  | 'depositing';

/** Todo lo que un estado necesita para decidir, sin acceso al DOM. */
export interface UnitStateContext {
  readonly entity: Entity;
  readonly world: World;
  readonly def: UnitDef;
  readonly bus: EventBus<GameEvents>;
}

export interface IUnitState {
  readonly id: StateId;

  /** Se ejecuta al entrar en el estado: fija la animación, reinicia contadores. */
  onEnter(ctx: UnitStateContext): void;

  /**
   * Se ejecuta cada paso de simulación.
   * @returns el estado al que transitar, o `null` para permanecer en este.
   */
  onUpdate(ctx: UnitStateContext, dt: number): StateId | null;

  /** Se ejecuta al salir del estado: limpia lo que quede pendiente. */
  onExit(ctx: UnitStateContext): void;
}

/** Base cómoda para estados que no necesitan entrada o salida. */
export abstract class BaseUnitState implements IUnitState {
  abstract readonly id: StateId;

  onEnter(_ctx: UnitStateContext): void {
    /* Por defecto no hace nada; las subclases lo sobrescriben si lo necesitan. */
  }

  abstract onUpdate(ctx: UnitStateContext, dt: number): StateId | null;

  onExit(_ctx: UnitStateContext): void {
    /* Por defecto no hace nada. */
  }
}
