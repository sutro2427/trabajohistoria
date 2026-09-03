import { COMBAT, DEFENSE_LINE_MARGIN, WORLD } from '../balance/balance.js';
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
 * Distancia desde la base a la que forma la línea defensiva de un bando.
 *
 * No es una constante: es **el depósito que se está explotando, más un
 * margen**. La tropa se planta siempre por delante de los porteadores, y a
 * medida que los depósitos cercanos se agotan y la recolección se desplaza
 * hacia el centro del mapa, la línea avanza con ella.
 *
 * Existe por dos motivos que apuntan en la misma dirección:
 *
 *  · **Legibilidad.** Con la línea fija en 110 px la tropa formaba justo
 *    encima de los dos primeros depósitos —donde trabajan los recolectores
 *    durante el primer tramo de partida—, y en pantalla soldados y porteadores
 *    se veían amontonados en el mismo punto.
 *
 *  · **Ritmo.** Una línea fija por delante de *todos* los depósitos (307 px)
 *    resuelve lo visual pero rompe el juego: medido, un principiante pasaba de
 *    ganar 9 de 10 en la primera operación a ganar 5, porque cada refuerzo
 *    recién producido tenía que cruzar solo trescientos píxeles y llegaba al
 *    frente de uno en uno. Seguir al depósito activo deja la línea en ~135 px
 *    al empezar —cuando el ejército aún es pequeño— y solo la adelanta cuando
 *    la partida ya está madura y hay tropa suficiente para sostenerla.
 */
export function defenseLineOffset(world: World, team: TeamId): number {
  const baseX = world.teams[team].baseX;
  let nearestActive = Infinity;
  let furthest = 0;

  for (const node of world.nodes) {
    if (node.team !== team) continue;
    const distance = Math.abs(node.x - baseX);
    if (distance > furthest) furthest = distance;
    if (node.amount > 0 && distance < nearestActive) nearestActive = distance;
  }

  // Sin depósitos con suministros la economía ya está muerta: la línea se
  // queda en el punto más avanzado en lugar de replegarse sobre la base.
  const reference = nearestActive === Infinity ? furthest : nearestActive;
  return reference + DEFENSE_LINE_MARGIN;
}

/**
 * Coordenada X hacia la que debe dirigirse una unidad según la postura de su
 * bando. Es la traducción de "una orden de escuadra" a "un destino personal".
 */
export function anchorFor(world: World, entity: Entity, stance: Stance): number {
  const team = world.teams[entity.team];
  const dir = advanceDirection(entity.team);

  /**
   * Retranqueo por fila. Con el tope de población en 50, si todas las unidades
   * apuntaran a la misma coordenada la formación se resolvería a empujones y
   * acabaría siendo una fila de medio mapa. Cuatro filas escalonadas se leen
   * como una escuadra y ocupan una cuarta parte del frente.
   */
  const rank = dir * entity.formationSlot * WORLD.formationSpacing;

  switch (stance) {
    case 'attack': {
      // Avanzar hasta la posición enemiga.
      const target = world.structureOf(opponentOf(entity.team));
      const front = target
        ? target.x - dir * WORLD.structureStandoff
        : team.baseX + dir * (WORLD.battlefieldWidth * 0.5);
      return front - rank;
    }
    case 'defend':
      // Formar por delante de los depósitos en explotación, no encima de
      // ellos. Ver `defenseLineOffset()`.
      return team.baseX + dir * defenseLineOffset(world, entity.team) - rank;
    case 'retreat':
      return team.baseX - dir * 10 - rank;
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
 * Distancia a la que la unidad quiere quedarse de su objetivo.
 *
 * La infantería no define `preferredRangeFactor` y avanza hasta el borde de su
 * alcance: quiere estar lo más cerca posible dentro de lo que le permite el
 * arma. El francotirador define un factor alto (~0.88), así que se planta
 * antes y **retrocede si el enemigo se le acerca**.
 *
 * Esa única diferencia de comportamiento es lo que hace que el francotirador
 * se sienta como tal en lugar de como un soldado con más daño, y es también lo
 * que crea su debilidad: mientras retrocede no dispara.
 */
export function preferredRange(def: UnitDef): number {
  return def.range * (def.preferredRangeFactor ?? 1);
}

/**
 * ¿Debe la unidad retroceder porque el enemigo está demasiado cerca?
 *
 * Solo se aplica a quien tiene una distancia preferida. El margen del 25 %
 * evita que la unidad oscile adelante y atrás en el límite exacto.
 */
export function shouldBackPedal(def: UnitDef, distance: number): boolean {
  if (def.preferredRangeFactor === undefined) return false;
  return distance < preferredRange(def) * 0.75;
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
