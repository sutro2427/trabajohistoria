import type { LevelDef } from './types.js';

/**
 * Definición de los niveles de la campaña.
 *
 * Toda la curva de dificultad vive aquí: reequilibrar un nivel no toca
 * ni una línea de lógica.
 */

const LEVEL_1: LevelDef = Object.freeze({
  id: 1,
  title: 'Valle de Ia Drang',
  briefing:
    'Comandante, el puesto de mando enemigo controla el valle.\n' +
    'Levanta tu economía con recolectores, entrena soldados y arrasa la posición.\n' +
    'Todo suministro que captures viajará contigo a la siguiente operación.',
  objective: 'Destruir el Puesto de Mando',
  /** Alcanza justo para dos recolectores: la primera decisión llega en el segundo cero. */
  startingSupplies: 10,
  populationMax: 12,
  /** La guarnición que pediste: dos soldados vietnamitas defendiendo. */
  garrison: Object.freeze(['vc_guerrilla', 'vc_guerrilla']),
  buildable: Object.freeze(['us_rifleman', 'us_harvester']),
  playerStructure: 'us_firebase',
  enemyStructure: 'vc_outpost',
  maxLoot: 50,
  ai: Object.freeze({
    incomePerSec: 0.55,
    firstWaveAt: 25,
    waveInterval: 30,
    waveSize: 2,
    waveSizeGrowth: 1,
    maxConcurrent: 6,
    /** Tope duro: garantiza que el nivel termina y no se eterniza. */
    maxTotalSpawned: 14,
    aggressionRatio: 1.15,
    pushDuration: 20,
    defenseLineOffset: 220,
  }),
});

/**
 * Nivel 2 — definido y jugable en cuanto se implementen los vehículos.
 *
 * Sobre "empezar desde cero": el jugador pierde ejército y recolectores, así
 * que la economía productiva se reconstruye desde el principio; el botín
 * capturado se acredita como suministros iniciales para que la recompensa del
 * nivel 1 tenga consecuencia real. Si se prefiere botín estrictamente cero,
 * basta con poner `startingSupplies: 10` y dejar de sumar el botín.
 */
const LEVEL_2: LevelDef = Object.freeze({
  id: 2,
  title: 'Operación Búnker',
  briefing:
    'Los planos capturados permiten ensamblar un M48 en el campo.\n' +
    'La posición enemiga está reforzada: diez guerrilleros y un T-54 la protegen.\n' +
    'Empiezas sin tropas: reconstruye la economía antes de que llegue el blindado.',
  objective: 'Eliminar 10 guerrilleros y 1 tanque',
  startingSupplies: 10,
  populationMax: 20,
  garrison: Object.freeze(['vc_guerrilla', 'vc_guerrilla', 'vc_guerrilla']),
  buildable: Object.freeze(['us_rifleman', 'us_harvester', 'us_tank']),
  playerStructure: 'us_firebase',
  enemyStructure: 'vc_bunker',
  maxLoot: 50,
  ai: Object.freeze({
    incomePerSec: 0.85,
    firstWaveAt: 15,
    waveInterval: 26,
    waveSize: 3,
    waveSizeGrowth: 1,
    maxConcurrent: 7,
    /** Exactamente los 10 guerrilleros del objetivo (+1 tanque aparte). */
    maxTotalSpawned: 10,
    aggressionRatio: 1.05,
    pushDuration: 25,
    defenseLineOffset: 200,
  }),
});

export const LEVELS: readonly LevelDef[] = Object.freeze([LEVEL_1, LEVEL_2]);

/** Devuelve la definición de un nivel por su número (1..n). */
export function getLevel(id: number): LevelDef {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`Nivel desconocido: ${id}`);
  return level;
}
