import type { UnitDef } from '../balance/types.js';
import type { IAiStrategy, AiStrategyContext } from '../ai/IAiStrategy.js';
import type { UnitFactory } from '../factories/UnitFactory.js';
import { teamPower } from '../states/targeting.js';
import { requestState } from '../world/Entity.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';

/**
 * Ejecuta la estrategia de la IA enemiga.
 *
 * Este sistema no contiene ninguna decisión: solo construye el contexto y
 * delega en la `IAiStrategy` inyectada. Cambiar la IA del nivel 2 es pasar
 * otra estrategia al constructor.
 */
export class AiDirectorSystem implements ISystem {
  readonly name = 'AiDirector';

  constructor(
    private readonly strategy: IAiStrategy,
    private readonly factory: UnitFactory,
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
      spawn: (defId) => {
        this.factory.create(world, defId);
      },
      setStance: (stance) => {
        if (me.stance === stance) return;
        me.stance = stance;
        // Igual que con las órdenes del jugador: se reevalúa el estado de cada
        // unidad para que la orden surta efecto en el mismo paso.
        for (const unit of world.units) {
          if (!unit.alive || unit.team !== me.id) continue;
          if (unit.state === 'die' || unit.state === 'hit') continue;
          requestState(unit, 'idle');
        }
        world.bus.emit('stance:changed', { team: me.id, stance });
      },
      powerOf: (team) => teamPower(world, team, this.defOf),
    };

    this.strategy.tick(ctx, dt);
  }
}
