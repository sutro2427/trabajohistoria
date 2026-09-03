import { EventBus } from '../../core/EventBus.js';
import { Rng } from '../../core/Rng.js';
import { WORLD } from '../balance/balance.js';
import type { LevelDef, TeamId } from '../balance/types.js';
import type { GameEvents } from '../events.js';
import type { Entity, Projectile, Structure } from './Entity.js';
import { createTeam, type Team } from './Team.js';

/**
 * Agregado raíz de la simulación: contiene todo el estado del campo de batalla.
 *
 * No importa nada del DOM. Esa restricción es deliberada y es lo que permite
 * ejecutar partidas completas dentro de un test de Node, en milisegundos y de
 * forma determinista.
 */
export class World {
  readonly bus = new EventBus<GameEvents>();
  readonly rng: Rng;
  readonly level: LevelDef;

  readonly units: Entity[] = [];
  readonly structures: Structure[] = [];
  readonly projectiles: Projectile[] = [];
  readonly teams: Readonly<Record<TeamId, Team>>;

  /** Segundos de partida transcurridos. */
  elapsed = 0;

  /** Resultado de la partida; `null` mientras sigue en juego. */
  outcome: { won: boolean; loot: number } | null = null;

  private nextId = 1;

  constructor(level: LevelDef, seed: number) {
    this.level = level;
    this.rng = new Rng(seed);
    this.teams = Object.freeze({
      US: createTeam('US', WORLD.usBaseX, level.startingSupplies, level.populationMax),
      // La IA no gasta población: su límite lo impone `maxTotalSpawned`.
      VC: createTeam('VC', WORLD.vcBaseX, 0, 99),
    });
  }

  /** Identificador único creciente para toda entidad del mundo. */
  allocateId(): number {
    return this.nextId++;
  }

  /** `true` si la partida ya terminó. */
  get finished(): boolean {
    return this.outcome !== null;
  }

  /** Unidades vivas de un bando. Excluye cadáveres pendientes de desaparecer. */
  livingUnits(team: TeamId): Entity[] {
    return this.units.filter((u) => u.alive && u.team === team);
  }

  /** Número de unidades vivas de un bando (sin construir un array intermedio). */
  countLiving(team: TeamId): number {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === team) n++;
    return n;
  }

  /** Busca una unidad viva por identificador. */
  findUnit(id: number): Entity | undefined {
    const u = this.units.find((e) => e.id === id);
    return u && u.alive ? u : undefined;
  }

  /** Busca una estructura en pie por identificador. */
  findStructure(id: number): Structure | undefined {
    const s = this.structures.find((e) => e.id === id);
    return s && s.alive ? s : undefined;
  }

  /** Estructura principal (en pie) de un bando. */
  structureOf(team: TeamId): Structure | undefined {
    return this.structures.find((s) => s.team === team && s.alive);
  }

  /**
   * Retira de las listas las entidades muertas cuyo cadáver ya se desvaneció.
   *
   * Se hace al final del paso, nunca en mitad de un sistema: eliminar
   * elementos mientras otro sistema recorre el mismo array produciría saltos
   * silenciosos difíciles de depurar.
   */
  collectGarbage(): void {
    removeInPlace(this.units, (u) => !u.alive && u.corpseTimer <= 0);
    removeInPlace(this.projectiles, (p) => !p.alive);
    removeInPlace(this.structures, (s) => !s.alive);
  }
}

/** Elimina en el sitio los elementos que cumplen el predicado, sin reasignar. */
function removeInPlace<T>(list: T[], shouldRemove: (item: T) => boolean): void {
  let write = 0;
  for (let read = 0; read < list.length; read++) {
    const item = list[read] as T;
    if (!shouldRemove(item)) {
      list[write++] = item;
    }
  }
  list.length = write;
}
