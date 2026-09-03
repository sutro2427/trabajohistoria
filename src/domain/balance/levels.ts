import type { LevelDef } from './types.js';

/**
 * Definición de los niveles de la campaña.
 *
 * Aquí vive el *escenario*: qué hay en el mapa y con qué empieza cada bando.
 * La curva de dificultad ya no está en este archivo — la elige el jugador en
 * el menú y vive en `difficulty.ts`, porque un mismo nivel se juega ahora en
 * Normal, Difícil o Imposible sin cambiar una sola cifra de aquí.
 *
 * Nótese que `startingSupplies` y `populationMax` no dicen "del jugador": los
 * reciben los dos bandos. Es la base del requisito de partida equilibrada.
 */

const LEVEL_1: LevelDef = Object.freeze({
  id: 1,
  title: 'Valle de Ia Drang',
  briefing:
    'El puesto de mando enemigo controla el valle.\n' +
    'Levanta tu economía con recolectores, entrena soldados y arrasa la posición.\n' +
    'El enemigo hará exactamente lo mismo: tiene sus propios depósitos y paga cada guerrillero.',
  objective: 'Destruir el Puesto de Mando',
  /**
   * Alcanza justo para dos recolectores (6 + 6 = 12) con un resto de 2. Con
   * los costes al alza había que subirlo de 10 a 14 para conservar la primera
   * decisión de la partida, que es la mejor que tiene el juego.
   */
  startingSupplies: 14,
  /** Idéntico para los dos bandos: el techo lo pone el mapa, no el favoritismo. */
  populationMax: 50,
  /** La guarnición que ya está plantada en la posición cuando llegas. */
  garrison: Object.freeze(['vc_guerrilla', 'vc_guerrilla']),
  buildable: Object.freeze(['us_rifleman', 'us_harvester']),
  enemyBuildable: Object.freeze(['vc_guerrilla', 'vc_harvester']),
  playerStructure: 'us_firebase',
  enemyStructure: 'vc_outpost',
  maxLoot: 50,
});

/**
 * Nivel 2 — definido y jugable en cuanto se implementen los vehículos.
 *
 * Sobre "empezar desde cero": el jugador pierde ejército y recolectores, así
 * que la economía productiva se reconstruye desde el principio; el botín
 * capturado se acredita como suministros iniciales para que la recompensa del
 * nivel 1 tenga consecuencia real.
 */
const LEVEL_2: LevelDef = Object.freeze({
  id: 2,
  title: 'Operación Búnker',
  briefing:
    'Los planos capturados permiten ensamblar un M48 en el campo.\n' +
    'La posición enemiga está reforzada y su economía ya está en marcha.\n' +
    'Reconstruye la tuya antes de que el búnker se llene de defensores.',
  objective: 'Destruir el Búnker de Mando',
  startingSupplies: 14,
  populationMax: 50,
  garrison: Object.freeze(['vc_guerrilla', 'vc_guerrilla', 'vc_guerrilla']),
  buildable: Object.freeze(['us_rifleman', 'us_harvester', 'us_tank']),
  enemyBuildable: Object.freeze(['vc_guerrilla', 'vc_harvester']),
  playerStructure: 'us_firebase',
  enemyStructure: 'vc_bunker',
  maxLoot: 50,
});

export const LEVELS: readonly LevelDef[] = Object.freeze([LEVEL_1, LEVEL_2]);

/** Devuelve la definición de un nivel por su número (1..n). */
export function getLevel(id: number): LevelDef {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`Nivel desconocido: ${id}`);
  return level;
}
