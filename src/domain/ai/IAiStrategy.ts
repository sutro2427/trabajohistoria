import type { Rng } from '../../core/Rng.js';
import type { Stance, TeamId } from '../balance/types.js';
import type { Team } from '../world/Team.js';
import type { World } from '../world/World.js';

/**
 * ============================================================================
 * PATRÓN STRATEGY — el comportamiento del enemigo
 * ============================================================================
 *
 * Cada partida inyecta la estrategia que corresponde a la dificultad elegida.
 * Cambiar cómo piensa el enemigo no toca ni el sistema que la ejecuta ni
 * ningún otro sistema.
 *
 * El detalle importante del contrato está en lo que **no** ofrece: no hay
 * ningún método para hacer aparecer una unidad. La única forma que tiene la IA
 * de poner un guerrillero en el mapa es `train`, que pasa por la misma cola de
 * entrenamiento, el mismo coste y el mismo límite de población que los botones
 * del jugador. Si la IA no ha recolectado, la IA no produce.
 */

/** Todo lo que una estrategia necesita para decidir. */
export interface AiStrategyContext {
  readonly world: World;
  readonly me: Team;
  readonly enemy: Team;
  /** Segundos de partida transcurridos. */
  readonly elapsed: number;
  /**
   * Encola una unidad pagando su coste real.
   * @returns `true` si la compra se aceptó (había suministros, hueco de
   *          población y la ranura de entrenamiento estaba libre).
   */
  train(defId: string): boolean;
  /** Cambia la postura del bando. */
  setStance(stance: Stance): void;
  /** Poder militar (vida × daño por segundo) de un bando. */
  powerOf(team: TeamId): number;
  /** Unidades vivas de un tipo concreto. */
  countUnits(team: TeamId, defId: string): number;
  /**
   * Generador determinista de la partida. Las estrategias lo usan para sus
   * errores deliberados; usar `Math.random` rompería la reproducibilidad por
   * semilla de la que dependen los tests de balance.
   */
  readonly rng: Rng;
}

export interface IAiStrategy {
  readonly id: string;
  tick(ctx: AiStrategyContext, dt: number): void;
}
