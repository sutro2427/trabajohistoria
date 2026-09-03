import type { TeamId } from '../balance/types.js';
import type { TrainingSystem } from '../systems/TrainingSystem.js';
import type { World } from '../world/World.js';
import type { ICommand } from './ICommand.js';

/** Orden de producción: encolar una unidad en la base. */
export class TrainUnitCommand implements ICommand {
  readonly name = 'TrainUnit';

  constructor(
    private readonly team: TeamId,
    private readonly defId: string,
    private readonly training: TrainingSystem,
    private readonly blueprintUnlocked: boolean = false,
  ) {}

  execute(world: World): void {
    // La validación (coste, población, planos) vive en `TrainingSystem`, no
    // aquí: el comando solo expresa la intención del jugador.
    this.training.tryEnqueue(world, this.team, this.defId, this.blueprintUnlocked);
  }
}
