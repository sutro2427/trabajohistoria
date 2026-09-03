import { getPowerDef, WORLD } from '../balance/balance.js';
import type { TeamId } from '../balance/types.js';
import type { Strike } from '../world/Strike.js';
import type { World } from '../world/World.js';
import type { ICommand } from './ICommand.js';
import { STRIKE_BOUNDS } from '../systems/StrikeSystem.js';
import { clamp } from '../../core/math.js';

/**
 * Lanzar un poder sobre un punto del mapa.
 *
 * Como todas las órdenes, se encola y se resuelve al principio del paso de
 * simulación, nunca en el instante del toque en pantalla. Eso mantiene el
 * determinismo y permite que un test lance un bombardeo igual que lo haría un
 * jugador.
 *
 * La validación (¿hay suministros?, ¿está enfriado?) vive aquí porque es una
 * regla del dominio, no de la interfaz: el botón deshabilitado es una cortesía
 * visual, pero la verdad la decide la simulación.
 */
export class LaunchPowerCommand implements ICommand {
  readonly name = 'LaunchPower';

  constructor(
    private readonly team: TeamId,
    private readonly powerId: string,
    private readonly targetX: number,
  ) {}

  execute(world: World): void {
    const team = world.teams[this.team];
    const state = team.powers.find((p) => p.defId === this.powerId);
    if (!state) return;

    const def = getPowerDef(this.powerId);

    if (state.cooldown > 0) return;
    if (team.supplies < def.cost) {
      world.bus.emit('power:rejected', {
        team: this.team,
        powerId: this.powerId,
        reason: 'supplies',
      });
      return;
    }

    team.supplies -= def.cost;
    team.spentOnPowers += def.cost;
    state.cooldown = def.cooldown;
    state.timesUsed++;

    const centerX = clamp(this.targetX, STRIKE_BOUNDS.minX, STRIKE_BOUNDS.maxX);

    const strike: Strike = {
      id: world.allocateId(),
      team: this.team,
      centerX,
      groundY: WORLD.groundY,
      halfWidth: def.areaHalfWidth,
      remaining: def.blastCount,
      // El primer impacto tarda `delay`: hay que anticipar dónde estará el enemigo.
      timer: def.delay,
      blastInterval: def.blastInterval,
      damagePerBlast: def.damagePerBlast,
      blastRadius: def.blastRadius,
      alive: true,
    };
    world.strikes.push(strike);

    world.bus.emit('supplies:changed', {
      team: this.team,
      value: team.supplies,
      delta: -def.cost,
    });
    world.bus.emit('power:launched', {
      team: this.team,
      powerId: this.powerId,
      x: centerX,
      halfWidth: def.areaHalfWidth,
      delay: def.delay,
    });
  }
}
