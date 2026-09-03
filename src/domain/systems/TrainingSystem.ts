import { ECONOMY } from '../balance/balance.js';
import type { TeamId, UnitDef } from '../balance/types.js';
import type { UnitFactory } from '../factories/UnitFactory.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';

/** Motivo por el que se rechaza una compra. */
export type TrainRejection = 'supplies' | 'population' | 'locked';

/**
 * Cola de entrenamiento: valida las compras y hace aparecer las unidades.
 *
 * Aquí está el regulador real del ritmo de partida. Con el soldado a 3 y el
 * recolector a 4, dos recolectores producen más suministros de los que se
 * pueden gastar; si la producción fuese paralela, el dinero dejaría de
 * importar a los treinta segundos. Con **una sola ranura**, el recurso escaso
 * pasa a ser el tiempo, y la pregunta del jugador deja de ser "¿me alcanza?"
 * para ser "¿qué construyo ahora, economía o ejército?". Esa es exactamente la
 * tensión de Stick War.
 */
export class TrainingSystem implements ISystem {
  readonly name = 'Training';

  constructor(
    private readonly factory: UnitFactory,
    private readonly defOf: (id: string) => UnitDef,
  ) {}

  update(world: World, dt: number): void {
    for (const team of Object.values(world.teams)) {
      const order = team.queue[0];
      if (!order) continue;

      order.remaining -= dt;
      if (order.remaining > 0) continue;

      team.queue.shift();
      this.factory.create(world, order.defId);
    }
  }

  /**
   * Intenta encolar una unidad.
   *
   * @returns `null` si se aceptó, o el motivo del rechazo.
   */
  tryEnqueue(
    world: World,
    teamId: TeamId,
    defId: string,
    blueprintUnlocked = false,
  ): TrainRejection | null {
    const team = world.teams[teamId];
    const def = this.defOf(defId);

    if (def.requiresBlueprint && !blueprintUnlocked) {
      world.bus.emit('training:rejected', { team: teamId, defId, reason: 'locked' });
      return 'locked';
    }

    if (team.queue.length >= ECONOMY.trainQueueSlots) {
      // La cola llena no se considera un error: es el ritmo del juego. El
      // jugador ve la barra de progreso y sabe que debe esperar.
      return 'supplies';
    }

    if (team.supplies < def.cost) {
      world.bus.emit('training:rejected', { team: teamId, defId, reason: 'supplies' });
      return 'supplies';
    }

    // La población se reserva contando también lo que ya está en la cola: sin
    // esto se podrían encolar unidades que al aparecer superarían el límite.
    const queued = team.queue.reduce((acc, o) => acc + this.defOf(o.defId).population, 0);
    if (team.population + queued + def.population > team.populationMax) {
      world.bus.emit('training:rejected', { team: teamId, defId, reason: 'population' });
      return 'population';
    }

    team.supplies -= def.cost;
    team.queue.push({ defId, remaining: def.trainTime, total: def.trainTime });

    world.bus.emit('supplies:changed', { team: teamId, value: team.supplies, delta: -def.cost });
    world.bus.emit('training:queued', { team: teamId, defId, trainTime: def.trainTime });
    return null;
  }
}
