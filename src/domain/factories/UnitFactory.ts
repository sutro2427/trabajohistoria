import { WORLD } from '../balance/balance.js';
import type { UnitDef } from '../balance/types.js';
import { newAnim } from '../world/components.js';
import type { Entity, Structure } from '../world/Entity.js';
import type { World } from '../world/World.js';
import { advanceDirection } from '../world/Team.js';
import { pickNodeFor } from '../world/ResourceNode.js';
import type { StateId } from '../states/IUnitState.js';

/**
 * Fábrica de unidades (patrón Factory Method).
 *
 * Toda la construcción de entidades pasa por aquí, y se hace exclusivamente a
 * partir de la definición del catálogo. No hay ni un `switch` por tipo de
 * unidad: añadir el tanque del nivel 2 no requiere tocar este archivo.
 */
export class UnitFactory {
  constructor(private readonly defOf: (id: string) => UnitDef) {}

  /**
   * Crea una unidad y la incorpora al mundo.
   *
   * @param x Posición de aparición. Si se omite, aparece en la base de su bando.
   */
  create(world: World, defId: string, x?: number): Entity {
    const def = this.defOf(defId);
    const team = world.teams[def.team];
    const dir = advanceDirection(def.team);

    // Las unidades aparecen algo por delante de la base y con una ligera
    // dispersión vertical: evita que se apilen en el mismo píxel y da al
    // carril una sensación de profundidad.
    const spawnX = x ?? team.baseX + dir * world.rng.range(8, 26);
    const spawnY = WORLD.groundY + world.rng.range(-WORLD.laneJitter, WORLD.laneJitter);
    const id = world.allocateId();

    // El depósito se elige ya al nacer para que el recolector salga andando
    // hacia el correcto en su primer paso, sin un fotograma de indecisión.
    const node = def.harvest ? pickNodeFor(world.nodes, def.team, spawnX) : undefined;

    const entity: Entity = {
      id,
      defId,
      team: def.team,
      alive: true,
      corpseTimer: 0,
      // El identificador reparte las filas de forma determinista y sin llevar
      // un contador aparte que hubiera que mantener al morir las unidades.
      formationSlot: id % WORLD.formationSlots,
      transform: { x: spawnX, y: spawnY, prevX: spawnX, prevY: spawnY, facing: dir },
      health: {
        hp: def.hp,
        maxHp: def.hp,
        armor: def.armor,
        flinchTimer: 0,
        flinchCooldown: 0,
      },
      anim: newAnim('idle'),
      state: initialStateFor(def),
      stateTimer: 0,
      pendingState: null,
      // Los componentes opcionales solo se añaden si el rol los necesita:
      // así cada sistema puede saltarse limpiamente lo que no le concierne.
      ...(def.damage > 0
        ? { combat: { cooldown: 0, aimTimer: 0, targetId: 0, targetIsStructure: false } }
        : {}),
      ...(def.harvest
        ? {
            harvester: {
              phase: 'toNode' as const,
              carried: 0,
              timer: 0,
              nodeId: node?.id ?? 0,
              nodeX: node?.x ?? team.baseX,
              depotX: team.baseX,
            },
          }
        : {}),
    };

    world.units.push(entity);
    team.population += def.population;
    team.totalSpawned++;

    world.bus.emit('unit:spawned', {
      entityId: entity.id,
      defId,
      team: def.team,
      x: spawnX,
      y: spawnY,
    });
    world.bus.emit('population:changed', {
      team: team.id,
      current: team.population,
      max: team.populationMax,
    });

    return entity;
  }
}

/**
 * Estado inicial según el rol.
 *
 * El recolector arranca ya de camino a la zona de acopio —empieza a producir
 * de inmediato— mientras que un soldado aparece esperando órdenes.
 */
function initialStateFor(def: UnitDef): StateId {
  return def.role === 'harvester' ? 'toNode' : 'idle';
}

/** Fábrica de estructuras. Mucho más simple: son estáticas y sin comportamiento. */
export class StructureFactory {
  constructor(
    private readonly defOf: (id: string) => {
      id: string;
      name: string;
      team: 'US' | 'VC';
      hp: number;
      width: number;
      height: number;
    },
  ) {}

  create(world: World, defId: string, x: number): Structure {
    const def = this.defOf(defId);
    const structure: Structure = {
      id: world.allocateId(),
      defId,
      team: def.team,
      x,
      y: WORLD.groundY,
      width: def.width,
      height: def.height,
      hp: def.hp,
      maxHp: def.hp,
      alive: true,
      hitFlash: 0,
    };
    world.structures.push(structure);
    world.teams[def.team].structureId = structure.id;
    return structure;
  }
}
