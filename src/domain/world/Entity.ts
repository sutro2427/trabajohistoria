import type { TeamId } from '../balance/types.js';
import type { AnimState, Combat, HarvesterState, Health, Transform } from './components.js';
import type { StateId } from '../states/IUnitState.js';

/**
 * Entidad del mundo: un identificador y los componentes que la describen.
 *
 * Los componentes opcionales son la clave del diseño: un sistema pregunta por
 * el componente que necesita y salta el resto. El sistema de combate no sabe
 * que existen los recolectores; el de recolección no sabe que existen las balas.
 */
export interface Entity {
  readonly id: number;
  /** Clave en el catálogo de unidades (`balance.ts`). */
  readonly defId: string;
  readonly team: TeamId;
  /** `false` marca la entidad para su retirada al final del paso. */
  alive: boolean;
  /** Segundos que el cadáver sigue visible antes de desaparecer. */
  corpseTimer: number;

  /**
   * Fila de formación (0..`WORLD.formationSlots`-1).
   *
   * Se asigna al crear la unidad y no cambia. Cada ranura retrasa el punto de
   * destino unos píxeles, de modo que una escuadra de treinta soldados forma
   * escalones legibles en lugar de converger toda a la misma coordenada y
   * resolverlo a empujones.
   */
  readonly formationSlot: number;

  readonly transform: Transform;
  readonly health: Health;
  readonly anim: AnimState;

  /** Estado actual de la máquina de estados. */
  state: StateId;
  /** Segundos transcurridos en el estado actual. */
  stateTimer: number;
  /**
   * Transición solicitada desde fuera de la máquina de estados (por ejemplo,
   * `DamageSystem` al matar a la unidad, o una orden de escuadra).
   *
   * Se solicita en lugar de asignarse directamente porque `state` es solo un
   * identificador: cambiarlo a mano se salta `onExit`/`onEnter` y con ello
   * todo lo que esos métodos hacen —liberar población, emitir el evento de
   * muerte, fijar la animación—. `StateMachineSystem` es el único autorizado
   * a consumir esta petición y ejecutar la transición completa.
   */
  pendingState: StateId | null;

  readonly combat?: Combat;
  readonly harvester?: HarvesterState;
}

/** Estructura estática: base propia u objetivo enemigo. */
export interface Structure {
  readonly id: number;
  readonly defId: string;
  readonly team: TeamId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  hp: number;
  readonly maxHp: number;
  alive: boolean;
  /** Segundos restantes del destello blanco al recibir un impacto. */
  hitFlash: number;
}

/** Proyectil en vuelo. */
export interface Projectile {
  readonly id: number;
  readonly team: TeamId;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly splashRadius: number;
  /** Segundos que le quedan de vida antes de desvanecerse. */
  life: number;
  /** Entidad que lo disparó; nunca puede impactarse a sí misma. */
  readonly ownerId: number;
  alive: boolean;
}

/**
 * Solicita una transición de estado desde fuera de la máquina de estados.
 * La aplicará `StateMachineSystem` en el paso siguiente, con su ciclo completo.
 */
export function requestState(entity: Entity, next: StateId): void {
  // La muerte tiene prioridad absoluta: nada la cancela.
  if (entity.pendingState === 'die' || entity.state === 'die') return;
  entity.pendingState = next;
}
