import type { UnitDef } from '../balance/types.js';
import type { StateId, UnitStateContext } from '../states/IUnitState.js';
import type { StateRegistry } from '../states/StateRegistry.js';
import type { World } from '../world/World.js';
import type { ISystem } from './ISystem.js';

/**
 * Ejecuta la máquina de estados de cada unidad y aplica las transiciones.
 *
 * Es el sistema que hace que las unidades "se comporten solas": cada una
 * decide por su cuenta a partir de la postura de su bando y de lo que ve
 * a su alrededor.
 */
export class StateMachineSystem implements ISystem {
  readonly name = 'StateMachine';

  /**
   * Tope de transiciones encadenadas en un mismo paso.
   *
   * Protege contra un ciclo del tipo `idle → move → idle` que se repita para
   * siempre por un error en las condiciones y congele el navegador. Si se
   * alcanza, la unidad simplemente se queda donde esté hasta el paso siguiente.
   */
  private static readonly MAX_TRANSITIONS = 4;

  constructor(
    private readonly registry: StateRegistry,
    private readonly defOf: (id: string) => UnitDef,
  ) {}

  update(world: World, dt: number): void {
    for (const entity of world.units) {
      const def = this.defOf(entity.defId);

      // Los cadáveres solo cuentan atrás hasta desvanecerse.
      if (!entity.alive) {
        entity.corpseTimer -= dt;
        continue;
      }

      const ctx: UnitStateContext = { entity, world, def, bus: world.bus };
      entity.stateTimer += dt;

      // Una transición pedida desde fuera (muerte, aturdimiento, orden de
      // escuadra) se aplica aquí, con su ciclo `onExit`/`onEnter` completo.
      // Es lo que garantiza que morir libere población y emita su evento.
      let transitions = 0;
      let next: StateId | null = entity.pendingState;
      entity.pendingState = null;

      if (next === null) {
        next = this.registry.get(entity.state).onUpdate(ctx, dt);
      }

      while (next !== null && next !== entity.state && transitions < StateMachineSystem.MAX_TRANSITIONS) {
        this.registry.get(entity.state).onExit(ctx);
        entity.state = next;
        entity.stateTimer = 0;
        this.registry.get(next).onEnter(ctx);
        transitions++;

        // Entrar en un estado puede a su vez pedir otra transición.
        if (entity.pendingState !== null) {
          next = entity.pendingState;
          entity.pendingState = null;
          continue;
        }
        // Un estado puede rechazar la entrada al instante (por ejemplo, `idle`
        // que descubre un enemigo justo al llegar). Se le da la oportunidad.
        next = this.registry.get(entity.state).onUpdate(ctx, 0);
      }
    }
  }
}
