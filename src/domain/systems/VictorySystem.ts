import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';

/**
 * Decide cuándo termina la partida y con qué resultado.
 *
 * Condiciones, en orden de comprobación:
 *
 *  · **Victoria** — cae la estructura enemiga. Es la condición canónica del
 *    género y la que da sentido a la orden ATACAR.
 *  · **Derrota** — cae tu base.
 *  · **Derrota por estancamiento** — te quedas sin unidades, sin nada en la
 *    cola y sin suministros para comprar la unidad más barata. Sin esta
 *    tercera condición la partida quedaría colgada para siempre: no habría
 *    forma de perder ni de seguir jugando.
 */
export class VictorySystem implements ISystem {
  readonly name = 'Victory';

  constructor(private readonly cheapestUnitCost: number) {}

  update(world: World): void {
    if (world.finished) return;

    const playerBase = world.structureOf('US');
    const enemyBase = world.structureOf('VC');

    // --- Victoria: la posición enemiga ha caído ---
    if (!enemyBase) {
      world.outcome = { won: true, loot: this.computeLoot(world) };
      this.announce(world);
      return;
    }

    // --- Derrota: se ha perdido la base propia ---
    if (!playerBase) {
      world.outcome = { won: false, loot: 0 };
      this.announce(world);
      return;
    }

    // --- Derrota por estancamiento ---
    const team = world.teams.US;
    const hasUnits = world.countLiving('US') > 0;
    const hasQueue = team.queue.length > 0;
    const canBuy = team.supplies >= this.cheapestUnitCost;
    if (!hasUnits && !hasQueue && !canBuy) {
      world.outcome = { won: false, loot: 0 };
      this.announce(world);
    }
  }

  /**
   * Botín que se traslada al nivel siguiente.
   *
   * Son los suministros que quedan en caja al ganar, topados por el máximo del
   * nivel. Recompensa gestionar bien la economía sin permitir que una partida
   * muy larga rompa el equilibrio del nivel 2.
   */
  private computeLoot(world: World): number {
    return Math.min(world.level.maxLoot, Math.floor(world.teams.US.supplies));
  }

  private announce(world: World): void {
    const outcome = world.outcome;
    if (!outcome) return;
    world.bus.emit('level:ended', {
      won: outcome.won,
      loot: outcome.loot,
      elapsed: world.elapsed,
      levelId: world.level.id,
    });
  }
}
