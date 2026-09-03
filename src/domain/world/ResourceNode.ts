import { WORLD } from '../balance/balance.js';
import type { TeamId } from '../balance/types.js';
import { advanceDirection } from './Team.js';

/**
 * ============================================================================
 * DEPÓSITOS DE SUMINISTROS
 * ============================================================================
 *
 * Un depósito es una posición del mapa con una cantidad finita de suministros.
 * No es una entidad con vida ni comportamiento: es terreno con valor, y por eso
 * vive en su propio módulo y no como un `Entity` más.
 *
 * Lo que aporta al juego es una curva. Los recolectores trabajan siempre el
 * depósito disponible más cercano, así que la economía empieza barata (viajes
 * de 70 px) y se va encareciendo sola conforme se vacían los bolsillos
 * próximos, sin que ningún sistema tenga que "subir la dificultad": el mapa se
 * gasta y las decisiones cambian con él.
 */
export interface ResourceNode {
  readonly id: number;
  /**
   * Bando en cuya retaguardia está el depósito.
   *
   * No implica propiedad exclusiva: cualquiera puede trabajarlo. Solo indica a
   * quién le queda cerca, que es lo que usan los recolectores para priorizar.
   */
  readonly team: TeamId;
  readonly x: number;
  /** Suministros que quedan. Baja de uno en uno con cada carga recogida. */
  amount: number;
  /** Suministros iniciales; se usa para dibujar el nivel de agotamiento. */
  readonly capacity: number;
  /** Distancia a la base de su bando. Es lo que encarece el viaje. */
  readonly distanceFromBase: number;
}

/**
 * Crea los depósitos de un bando: cinco escalonados desde su base hacia el
 * centro del mapa, con los lejanos más ricos que los cercanos.
 */
export function createResourceNodes(
  team: TeamId,
  baseX: number,
  allocateId: () => number,
): ResourceNode[] {
  const dir = advanceDirection(team);
  return WORLD.resourceOffsets.map((offset, i) => {
    // Si algún día se añade un depósito sin su cantidad, hereda la última
    // definida en lugar de quedarse a cero y romper la economía en silencio.
    const amount =
      WORLD.resourceAmounts[i] ??
      WORLD.resourceAmounts[WORLD.resourceAmounts.length - 1] ??
      100;
    return {
      id: allocateId(),
      team,
      x: baseX + dir * offset,
      amount,
      capacity: amount,
      distanceFromBase: offset,
    };
  });
}

/**
 * Elige el depósito que debe trabajar un recolector.
 *
 * Prioridad, en este orden:
 *
 *  1. El más cercano **de su propio bando** que aún tenga suministros. Es el
 *     comportamiento normal y el que mantiene a los recolectores en casa.
 *  2. Si su bando ya no tiene nada, el más cercano de cualquier bando. Aquí es
 *     donde una partida larga se convierte en una disputa por el terreno: los
 *     recolectores tienen que salir a buscar, y salir a buscar es exponerse.
 *
 * Devuelve `undefined` si no queda un solo suministro en todo el mapa.
 */
export function pickNodeFor(
  nodes: readonly ResourceNode[],
  team: TeamId,
  fromX: number,
): ResourceNode | undefined {
  return nearest(nodes, team, fromX) ?? nearest(nodes, null, fromX);
}

/** Depósito no vacío más próximo a `fromX`; `team === null` acepta cualquiera. */
function nearest(
  nodes: readonly ResourceNode[],
  team: TeamId | null,
  fromX: number,
): ResourceNode | undefined {
  let best: ResourceNode | undefined;
  let bestDist = Infinity;
  for (const node of nodes) {
    if (node.amount <= 0) continue;
    if (team !== null && node.team !== team) continue;
    const d = Math.abs(node.x - fromX);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

/** Suministros que quedan en el mapa, de un bando o de todos. */
export function remainingSupplies(
  nodes: readonly ResourceNode[],
  team?: TeamId,
): number {
  let total = 0;
  for (const node of nodes) {
    if (team !== undefined && node.team !== team) continue;
    total += node.amount;
  }
  return total;
}
