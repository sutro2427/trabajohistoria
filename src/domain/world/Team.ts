import type { Stance, TeamId } from '../balance/types.js';

/** Unidad esperando en la cola de entrenamiento. */
export interface TrainingOrder {
  readonly defId: string;
  /** Segundos restantes hasta que la unidad aparece. */
  remaining: number;
  readonly total: number;
}

/**
 * Estado de un bando.
 *
 * `stance` es la pieza central del diseño de órdenes: una única variable por
 * bando. Las unidades no reciben órdenes individuales, sino que cada una lee
 * la postura de su equipo y deduce a dónde debe ir. Cambiar un número produce
 * el movimiento coordinado de toda la escuadra.
 */
export interface Team {
  readonly id: TeamId;
  supplies: number;
  population: number;
  populationMax: number;
  stance: Stance;
  /** Cola de entrenamiento. Su longitud máxima la fija `ECONOMY.trainQueueSlots`. */
  readonly queue: TrainingOrder[];
  /** Coordenada X de la base: origen de las tropas y destino del repliegue. */
  readonly baseX: number;
  /** Identificador de la estructura principal del bando. */
  structureId: number;
  /** Total de unidades generadas en la partida (lo usa el tope de la IA). */
  totalSpawned: number;
  /** Bajas causadas al enemigo; alimenta el marcador de objetivos. */
  kills: number;
  /** Suministros acumulados por recolección durante la partida. */
  harvested: number;
}

export function createTeam(id: TeamId, baseX: number, supplies: number, populationMax: number): Team {
  return {
    id,
    supplies,
    population: 0,
    populationMax,
    // Todos empiezan defendiendo, igual que en Stick War: la postura de partida
    // es mantener la posición, y atacar es siempre una decisión explícita.
    stance: 'defend',
    queue: [],
    baseX,
    structureId: 0,
    totalSpawned: 0,
    kills: 0,
    harvested: 0,
  };
}

/** Bando contrario. */
export function opponentOf(id: TeamId): TeamId {
  return id === 'US' ? 'VC' : 'US';
}

/** Dirección de avance de un bando: EE.UU. ataca hacia la derecha. */
export function advanceDirection(id: TeamId): 1 | -1 {
  return id === 'US' ? 1 : -1;
}
