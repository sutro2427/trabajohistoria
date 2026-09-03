import { COMBAT, WORLD } from '../balance/balance.js';
import type { Stance, TeamId, UnitDef } from '../balance/types.js';
import type { Entity, Structure } from '../world/Entity.js';
import type { World } from '../world/World.js';
import { advanceDirection, opponentOf } from '../world/Team.js';

/**
 * Funciones de percepción y decisión compartidas por los estados.
 *
 * Se extraen aquí para que un cambio en "a quién disparo" o en "hasta dónde
 * avanzo" se haga en un solo lugar y afecte por igual a todas las unidades.
 */

/** Resultado de buscar un blanco. */
export interface TargetResult {
  readonly unit?: Entity;
  readonly structure?: Structure;
  readonly distance: number;
}

/**
 * Busca el enemigo más cercano dentro de un radio.
 *
 * Se prioriza la unidad más próxima y no la más débil: es lo que produce la
 * línea de frente natural de Stick War, donde las tropas se traban con lo que
 * tienen delante en lugar de cruzar el mapa persiguiendo al blanco ideal.
 */
export function findNearestEnemy(world: World, self: Entity, radius: number): TargetResult {
  const enemyTeam = opponentOf(self.team);
  let best: Entity | undefined;
  let bestDist = radius;

  for (const other of world.units) {
    if (!other.alive || other.team !== enemyTeam) continue;
    const d = Math.abs(other.transform.x - self.transform.x);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }

  if (best) return { unit: best, distance: bestDist };

  // Sin unidades a la vista, la estructura enemiga es el blanco por defecto:
  // así una escuadra que rompe la defensa sigue avanzando y derriba la posición.
  const structure = world.structureOf(enemyTeam);
  if (structure) {
    const d = Math.abs(structure.x - self.transform.x);
    if (d < radius) return { structure, distance: d };
  }

  return { distance: Infinity };
}

/**
 * Coordenada X hacia la que debe dirigirse una unidad según la postura de su
 * bando. Es la traducción de "una orden de escuadra" a "un destino personal".
 */
export function anchorFor(world: World, entity: Entity, stance: Stance): number {
  const team = world.teams[entity.team];
  const dir = advanceDirection(entity.team);

  switch (stance) {
    case 'attack': {
      // Avanzar hasta la posición enemiga.
      const target = world.structureOf(opponentOf(entity.team));
      return target ? target.x - dir * WORLD.structureStandoff : team.baseX + dir * 900;
    }
    case 'defend':
      // Formar una línea por delante de la base propia, no encima de ella:
      // así el combate se libra en el parapeto y no dentro del campamento.
      return team.baseX + dir * 110;
    case 'retreat':
      return team.baseX - dir * 10;
  }
}

/** `true` si la unidad ya llegó a su destino (con un margen para evitar el temblor). */
export function atAnchor(x: number, anchor: number, tolerance = 6): boolean {
  return Math.abs(x - anchor) <= tolerance;
}

/** Distancia a la que la unidad deja de avanzar y se prepara para disparar. */
export function engageRange(def: UnitDef): number {
  return def.range * COMBAT.engageRangeFactor;
}

/**
 * ¿Puede esta unidad disparar a este blanco desde aquí?
 * Exige estar en alcance y mirando hacia él.
 */
export function canFireAt(self: Entity, targetX: number, def: UnitDef): boolean {
  const dx = targetX - self.transform.x;
  if (Math.abs(dx) > def.range) return false;
  return Math.sign(dx) === self.transform.facing || dx === 0;
}

/**
 * Poder militar de un bando: suma de vida × daño por segundo.
 *
 * La IA lo usa para decidir si ataca. Multiplicar vida por daño (en vez de
 * contar unidades) evita que la IA se lance con seis unidades malheridas
 * contra tres a plena vida.
 */
export function teamPower(world: World, team: TeamId, defOf: (id: string) => UnitDef): number {
  let power = 0;
  for (const u of world.units) {
    if (!u.alive || u.team !== team) continue;
    const def = defOf(u.defId);
    const dps = def.damage * def.fireRate;
    if (dps <= 0) continue; // los recolectores no cuentan como fuerza de combate
    power += u.health.hp * dps;
  }
  return power;
}
