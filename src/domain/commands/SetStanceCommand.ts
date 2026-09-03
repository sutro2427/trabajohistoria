import type { Stance, TeamId } from '../balance/types.js';
import { applyStance } from '../world/stance.js';
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
    // La aplicación vive en `world/stance.ts` porque el director de la IA hace
    // exactamente lo mismo: dos copias de esta regla ya se desincronizaron una
    // vez y le costaron la economía al enemigo.
    applyStance(world, this.team, this.stance);
  }
}
