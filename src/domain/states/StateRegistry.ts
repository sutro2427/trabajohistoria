import type { IUnitState, StateId } from './IUnitState.js';
import {
  AttackState,
  DieState,
  EngageState,
  HitState,
  IdleState,
  MoveState,
} from './CombatStates.js';
import {
  DepositingState,
  GatheringState,
  ReturningState,
  ToNodeState,
} from './HarvestStates.js';

/**
 * Registro de las instancias de estado.
 *
 * Se crea UNA instancia por tipo de estado y la comparten todas las unidades.
 * Es posible porque los estados no guardan datos propios: todo lo mutable
 * (temporizadores, blanco actual) vive en la entidad. Con cientos de
 * transiciones por segundo, crear un objeto en cada una generaría basura
 * constante y tirones del recolector de memoria.
 */
export class StateRegistry {
  private readonly states: ReadonlyMap<StateId, IUnitState>;

  constructor() {
    const all: readonly IUnitState[] = [
      new IdleState(),
      new MoveState(),
      new EngageState(),
      new AttackState(),
      new HitState(),
      new DieState(),
      new ToNodeState(),
      new GatheringState(),
      new ReturningState(),
      new DepositingState(),
    ];
    this.states = new Map(all.map((s) => [s.id, s]));
  }

  get(id: StateId): IUnitState {
    const state = this.states.get(id);
    if (!state) throw new Error(`Estado no registrado: "${id}"`);
    return state;
  }

  /** Identificadores registrados. Lo usan los tests para recorrerlos todos. */
  ids(): StateId[] {
    return [...this.states.keys()];
  }
}
