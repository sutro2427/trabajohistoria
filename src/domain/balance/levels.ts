import type { LevelDef } from './types.js';

/**
 * ============================================================================
 * CAMPAÑA — tres niveles con una curva deliberada
 * ============================================================================
 *
 * La progresión no añade dificultad subiendo números, sino **introduciendo una
 * decisión nueva en cada nivel**:
 *
 *   1. Ia Drang     — solo soldados. Aprendes el ciclo: recolectar, producir,
 *                     atacar. La IA es lenta y comete errores a propósito.
 *   2. Colina 812   — aparecen los francotiradores. Ya no basta con acumular
 *                     tropa: hay que componer el ejército y cubrir al tirador.
 *   3. Paso Mekong  — blindados y bombas de racimo. La partida se decide por
 *                     cuándo gastas: el tanque y las bombas compiten por los
 *                     mismos suministros que tu infantería.
 *
 * La dificultad de la IA la fija **el nivel**, no el jugador: así todos los
 * alumnos compiten exactamente bajo las mismas condiciones y el ranking
 * significa algo.
 */

const LEVEL_1: LevelDef = Object.freeze({
  id: 1,
  title: 'Valle de Ia Drang',
  tagline: 'Solo infantería. Aprende el ciclo.',
  briefing:
    'Primera operación, comandante.\n\n' +
    'Compra RECOLECTORES para que entren suministros y SOLDADOS para pelear.\n' +
    'Cuando tengas tropa suficiente, pulsa ATACAR y toma el puesto enemigo.',
  objective: 'Destruir el Puesto de Mando',
  startingSupplies: 14,
  populationMax: 50,
  garrison: Object.freeze(['vc_guerrilla', 'vc_guerrilla']),
  buildable: Object.freeze(['us_rifleman', 'us_harvester']),
  enemyBuildable: Object.freeze(['vc_guerrilla', 'vc_harvester']),
  powers: Object.freeze([]),
  playerStructure: 'us_firebase',
  enemyStructure: 'vc_outpost',
  maxLoot: 50,
  difficulty: 'normal',
});

const LEVEL_2: LevelDef = Object.freeze({
  id: 2,
  title: 'Colina 812',
  tagline: 'Llegan los francotiradores. Cubre a tus tiradores.',
  briefing:
    'El enemigo ha desplegado tiradores selectos en la ladera.\n\n' +
    'Tienes FRANCOTIRADORES: pegan de lejos y muy fuerte, pero mueren en cuanto\n' +
    'los alcanzan. Colócalos detrás de tus soldados o los perderás gratis.',
  objective: 'Destruir el Puesto de Mando',
  startingSupplies: 18,
  populationMax: 50,
  garrison: Object.freeze(['vc_guerrilla', 'vc_marksman']),
  buildable: Object.freeze(['us_rifleman', 'us_harvester', 'us_sniper']),
  enemyBuildable: Object.freeze(['vc_guerrilla', 'vc_harvester', 'vc_marksman']),
  powers: Object.freeze([]),
  playerStructure: 'us_firebase',
  enemyStructure: 'vc_outpost',
  maxLoot: 50,
  /**
   * La IA sigue en 'normal' aquí, a propósito.
   *
   * El salto de dificultad del nivel 2 tiene que venir de la unidad nueva —hay
   * que aprender a componer el ejército y a proteger al tirador—, no de una IA
   * que además piensa el doble de rápido. Subir las dos cosas a la vez lo
   * volvía invencible: en pruebas, cero victorias de diez con juego correcto.
   */
  difficulty: 'normal',
});

const LEVEL_3: LevelDef = Object.freeze({
  id: 3,
  title: 'Paso del Mekong',
  tagline: 'Blindados y bombas de racimo. Decide en qué gastas.',
  briefing:
    'Operación final. El búnker está defendido por blindados.\n\n' +
    'Puedes construir un TANQUE y lanzar BOMBAS DE RACIMO sobre el mapa,\n' +
    'pero ambos salen del mismo bolsillo que tu infantería.\n' +
    'Aquí no gana quien más produce, sino quien decide mejor y más rápido.',
  objective: 'Destruir el Búnker de Mando',
  // Arranque más holgado: el nivel enfrenta a un blindado desde el principio
  // y el jugador necesita margen para montar una respuesta.
  startingSupplies: 24,
  populationMax: 50,
  /**
   * Guarnición del nivel final, con blindado incluido.
   *
   * El tanque enemigo se coloca en la guarnición y no se deja a criterio de la
   * IA porque el nivel tiene que *garantizar* el encuentro con un blindado:
   * es lo que introduce, y el alumno tiene que enfrentarse a él sí o sí.
   */
  garrison: Object.freeze(['vc_guerrilla', 'vc_guerrilla', 'vc_marksman', 'vc_tank']),
  buildable: Object.freeze(['us_rifleman', 'us_harvester', 'us_sniper', 'us_tank']),
  enemyBuildable: Object.freeze(['vc_guerrilla', 'vc_harvester', 'vc_marksman', 'vc_tank']),
  powers: Object.freeze(['us_cluster_bomb']),
  playerStructure: 'us_firebase',
  enemyStructure: 'vc_bunker',
  maxLoot: 50,
  /**
   * La IA se queda en 'normal' también aquí.
   *
   * La dificultad del nivel final la ponen el blindado de la guarnición y el
   * búnker reforzado, que ya obligan a componer un ejército distinto. Sumarle
   * una IA que piensa el doble de rápido lo volvía imposible: cero victorias
   * de ocho en las partidas simuladas, con el tanque enemigo llegando a la
   * base del jugador sin un rasguño.
   */
  difficulty: 'normal',
});

export const LEVELS: readonly LevelDef[] = Object.freeze([LEVEL_1, LEVEL_2, LEVEL_3]);

/** Número de niveles de la campaña. Completarlos todos es ganar la competencia. */
export const TOTAL_LEVELS = LEVELS.length;

/** Devuelve la definición de un nivel por su número (1..n). */
export function getLevel(id: number): LevelDef {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`Nivel desconocido: ${id}`);
  return level;
}

/** `true` si el identificador corresponde a un nivel existente. */
export function isValidLevel(id: number): boolean {
  return LEVELS.some((l) => l.id === id);
}
