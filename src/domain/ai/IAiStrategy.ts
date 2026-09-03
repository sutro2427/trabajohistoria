import type { Stance } from '../balance/types.js';
import type { Team } from '../world/Team.js';
import type { World } from '../world/World.js';

/**
 * ============================================================================
 * PATRÓN STRATEGY — el comportamiento del enemigo
 * ============================================================================
 *
 * Cada nivel inyecta la estrategia que le corresponde. Cambiar cómo piensa el
 * enemigo no toca ni el sistema que la ejecuta ni ningún otro sistema.
 */

/** Todo lo que una estrategia necesita para decidir. */
export interface AiStrategyContext {
  readonly world: World;
  readonly me: Team;
  readonly enemy: Team;
  /** Segundos de partida transcurridos. */
  readonly elapsed: number;
  /** Genera una unidad en la base propia, sin coste ni cola. */
  spawn(defId: string): void;
  /** Cambia la postura del bando enemigo. */
  setStance(stance: Stance): void;
  /** Poder militar (vida × daño por segundo) de un bando. */
  powerOf(team: 'US' | 'VC'): number;
}

export interface IAiStrategy {
  readonly id: string;
  tick(ctx: AiStrategyContext, dt: number): void;
}
