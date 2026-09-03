import type { Stance, TeamId } from '../balance/types.js';
import { requestState } from '../world/Entity.js';
import type { World } from '../world/World.js';
import type { ICommand } from './ICommand.js';

/**
 * Orden de escuadra: ATACAR, DEFENDER o RETIRARSE.
 *
 * El comando cambia **una sola variable**: la postura del bando. No recorre
 * las unidades ni les asigna destinos. Cada máquina de estados lee esa postura
 * por su cuenta y deduce hacia dónde ir.
 *
 * Ese indireccionamiento es lo que hace que el ejército se mueva como un
 * grupo coherente sin necesidad de un sistema de formaciones: una unidad
 * creada tres segundos después de la orden se une al avance automáticamente,
 * porque lee la misma variable.
 */
export class SetStanceCommand implements ICommand {
  readonly name = 'SetStance';

  constructor(
    private readonly team: TeamId,
    private readonly stance: Stance,
  ) {}

  execute(world: World): void {
    const team = world.teams[this.team];
    if (team.stance === this.stance) return;

    team.stance = this.stance;

    // Se saca a las unidades de su estado actual para que reevalúen de
    // inmediato. Sin esto, una unidad esperando en `idle` tardaría hasta un
    // paso entero en reaccionar y la orden se sentiría con retardo.
    for (const unit of world.units) {
      if (!unit.alive || unit.team !== this.team) continue;
      // Ni los muertos ni los aturdidos interrumpen su estado.
      if (unit.state === 'die' || unit.state === 'hit') continue;
      // Los recolectores solo cambian de rutina para replegarse; en cualquier
      // otra postura siguen produciendo, que es su trabajo.
      const isHarvesting =
        unit.state === 'toNode' ||
        unit.state === 'gathering' ||
        unit.state === 'returning' ||
        unit.state === 'depositing';
      if (isHarvesting && this.stance !== 'retreat') continue;

      requestState(unit, 'idle');
    }

    world.bus.emit('stance:changed', { team: this.team, stance: this.stance });
  }
}
