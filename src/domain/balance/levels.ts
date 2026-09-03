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
  /**
   * Dificultad 'easy' (Recluta), no 'normal'.
   *
   * Es la primera partida de la vida del alumno: tiene que poder ganarla
   * mientras aprende qué hace cada botón. Contra 'normal', un jugador novato
   * realista perdía las diez partidas medidas.
   */
  difficulty: 'easy',
  /** Diez unidades enemigas como máximo: un ejército que se puede batir. */
  enemyPopulationCap: 10,
  timeLimitSec: 360,
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
   * El salto de dificultad del nivel 2 lo aporta el tirador enemigo de la
   * guarnición —hay que aprender a componer el ejército y a cubrir al
   * propio—, no una IA que además piense más rápido. Subir las dos cosas a la
   * vez lo volvía invencible: medido contra un jugador medio realista, cero
   * victorias de diez.
   */
  difficulty: 'easy',
  /**
   * Doce, algo por encima del nivel 1.
   *
   * El techo del enemigo resultó no ser la palanca de este nivel: con 10, 11 o
   * 12 el resultado medido era idéntico. Lo que decide aquí es el *criterio*
   * de la IA, no su número — de ahí que se quede en 'Recluta' y la dificultad
   * la ponga el tirador enemigo de la guarnición.
   */
  enemyPopulationCap: 12,
  timeLimitSec: 420,
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
   * La operación final usa 'Veterano' — y resulta MENOS letal que 'Normal'.
   *
   * Parece un contrasentido y no lo es: 'Veterano' sabe cortar un ataque que
   * se ha torcido (`retreatRatio`) y replegarse, mientras que 'Normal' mete
   * todo su ejército sin parar hasta la última baja. Contra un jugador humano,
   * esa presión continua agota más que un rival que se retira a tiempo.
   * Medido: con 'Normal' el novato ganaba 0 de 10; con 'Veterano', 6 de 10.
   *
   * Es un buen recordatorio de que "IA más lista" y "nivel más difícil" no son
   * lo mismo, y de que estas cosas solo se saben midiéndolas.
   */
  difficulty: 'hard',
  /**
   * El techo más alto de la campaña — y el número más delicado de todo el
   * balance, porque aquí no se comporta como un dial sino como un interruptor.
   *
   * La guarnición ocupa 11 de población (el blindado solo son 8) y la IA se
   * paga tres porteadores. Con el techo en 17 no le quedaba hueco para juntar
   * la escuadra que su perfil exige antes de atacar (`minArmyToAttack`), así
   * que se quedaba **defendiendo su base durante toda la partida**: el jugador
   * montaba su ejército sin oposición y entraba a placer. Ese era el "gané muy
   * fácil" del encargo, y no se arreglaba haciendo a la IA más lista.
   *
   * Con 18 sí llega a esa escuadra, y la operación final pasa a tener oleadas
   * de verdad. Medido sobre 60 campañas encadenadas (el botín de un nivel
   * entra en el siguiente, como en la partida real):
   *
   *              techo 17      techo 18
   *   medio        79 %          38 %
   *   bueno        93 %          73 %
   *
   * De ahí que no se suba más: con 20 el jugador bueno baja al 43 % y la
   * operación deja de ser ganable para casi todos. Un punto de población es
   * toda la diferencia entre un rival pasivo y uno que presiona.
   */
  enemyPopulationCap: 18,
  timeLimitSec: 480,
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
