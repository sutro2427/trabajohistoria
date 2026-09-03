import { WORLD } from '../balance/balance.js';
import type { UnitDef } from '../balance/types.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';
import type { DamageSystem } from './DamageSystem.js';

/**
 * Hace caer las andanadas y enfría los poderes.
 *
 * El sistema no sabe qué es una "bomba de racimo": solo sabe que hay
 * explosiones pendientes que deben caer en una zona a cierto ritmo. Añadir
 * napalm o un ataque de artillería sería un registro más en el catálogo de
 * poderes, sin tocar este archivo.
 */
export class StrikeSystem implements ISystem {
  readonly name = 'Strike';

  constructor(
    private readonly defOf: (id: string) => UnitDef,
    private readonly damage: DamageSystem,
  ) {}

  update(world: World, dt: number): void {
    // --- Enfriamiento de los poderes de cada bando ---
    for (const team of Object.values(world.teams)) {
      for (const power of team.powers) {
        if (power.cooldown > 0) power.cooldown = Math.max(0, power.cooldown - dt);
      }
    }

    // --- Andanadas en curso ---
    for (const strike of world.strikes) {
      if (!strike.alive) continue;

      strike.timer -= dt;
      if (strike.timer > 0) continue;

      strike.timer = strike.blastInterval;
      strike.remaining--;
      if (strike.remaining < 0) {
        strike.alive = false;
        continue;
      }

      // Cada explosión cae en un punto al azar de la zona. La dispersión es
      // lo que hace que sea un bombardeo de área y no un disparo de precisión.
      const offset = world.rng.range(-strike.halfWidth, strike.halfWidth);
      this.detonate(world, strike.centerX + offset, strike.groundY, strike);
    }
  }

  /** Una explosión concreta: daña a todo enemigo dentro del radio. */
  private detonate(
    world: World,
    x: number,
    y: number,
    strike: { team: string; damagePerBlast: number; blastRadius: number },
  ): void {
    world.bus.emit('projectile:hit', { x, y, splashRadius: strike.blastRadius });

    for (const unit of world.units) {
      if (!unit.alive || unit.team === strike.team) continue;
      const d = Math.abs(unit.transform.x - x);
      if (d > strike.blastRadius) continue;
      // Atenuación hacia el borde: estar en el centro es mucho peor.
      const falloff = 1 - (d / strike.blastRadius) * 0.55;
      this.damage.damageUnit(
        world,
        unit,
        strike.damagePerBlast * falloff,
        this.defOf(unit.defId),
      );
    }

    for (const structure of world.structures) {
      if (!structure.alive || structure.team === strike.team) continue;
      if (Math.abs(structure.x - x) <= strike.blastRadius + structure.width * 0.5) {
        // Las estructuras encajan la mitad: el bombardeo es un arma
        // antipersonal, no una forma barata de derribar la posición enemiga.
        this.damage.damageStructure(world, structure, strike.damagePerBlast * 0.5);
      }
    }
  }
}

/** Límites en los que el jugador puede marcar un objetivo de bombardeo. */
export const STRIKE_BOUNDS = Object.freeze({
  minX: 20,
  maxX: WORLD.battlefieldWidth - 20,
});
