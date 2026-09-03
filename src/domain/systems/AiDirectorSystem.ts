import type { TeamId, UnitDef } from '../balance/types.js';
import type { IAiStrategy, AiStrategyContext } from '../ai/IAiStrategy.js';
import { teamPower } from '../states/targeting.js';
import { applyStance } from '../world/stance.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';
import type { TrainingSystem } from './TrainingSystem.js';

/**
 * Ejecuta la estrategia de la IA enemiga.
 *
 * Este sistema no contiene ninguna decisión: solo construye el contexto y
 * delega en la `IAiStrategy` inyectada. Cambiar la IA de una dificultad es
 * pasar otra estrategia al constructor.
 *
 * La pieza clave del cableado es que `train` va contra el **mismo**
 * `TrainingSystem` que usan los botones del jugador. No hay un camino
 * alternativo por el que la IA pueda materializar unidades: comparte cola,
 * coste, tiempo de entrenamiento y tope de población.
 */
export class AiDirectorSystem implements ISystem {
  readonly name = 'AiDirector';

  constructor(
    private readonly strategy: IAiStrategy,
    private readonly training: TrainingSystem,
    private readonly defOf: (id: string) => UnitDef,
  ) {}

  update(world: World, dt: number): void {
    if (world.finished) return;

    const me = world.teams.VC;
    const enemy = world.teams.US;

    const ctx: AiStrategyContext = {
      world,
      me,
      enemy,
      elapsed: world.elapsed,
      rng: world.rng,
      train: (defId) => this.training.tryEnqueue(world, me.id, defId) === null,
      // Exactamente el mismo camino que usan los botones del jugador, incluida
      // la regla de que los porteadores no abandonan el acopio salvo repliegue.
      setStance: (stance) => {
        applyStance(world, me.id, stance);
      },
      powerOf: (team) => teamPower(world, team, this.defOf),
      countUnits: (team, defId) => countUnits(world, team, defId),
    };

    this.strategy.tick(ctx, dt);
  }
}

/** Unidades vivas de un tipo concreto en un bando. */
function countUnits(world: World, team: TeamId, defId: string): number {
  let n = 0;
  for (const u of world.units) {
    if (u.alive && u.team === team && u.defId === defId) n++;
  }
  return n;
}
