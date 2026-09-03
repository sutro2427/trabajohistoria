/**
 * ============================================================================
 * DIFICULTAD — cómo de bien juega la IA, no cuánto le regalamos
 * ============================================================================
 *
 * Regla de diseño que gobierna este archivo: **ningún campo aquí le da
 * recursos, unidades ni población extra a la IA**. Los tres perfiles comparten
 * economía, costes, tiempos de entrenamiento y tope de población con el
 * jugador. Lo único que cambia es la *calidad de sus decisiones*:
 *
 *   · cuántos recolectores considera suficientes y cuándo amplía la economía;
 *   · cada cuánto reevalúa la situación;
 *   · cuánta ventaja exige antes de lanzar un ataque;
 *   · cuánto tarda en darse cuenta de que la están invadiendo;
 *   · con qué frecuencia se equivoca a propósito.
 *
 * Subir de Normal a Imposible no pone más enemigos en el mapa: pone un
 * adversario que administra mejor exactamente los mismos recursos.
 */

export type DifficultyId = 'normal' | 'hard' | 'impossible';

/**
 * ---------------------------------------------------------------------------
 * Calibrado
 * ---------------------------------------------------------------------------
 *
 * Los tres perfiles se ajustaron jugando partidas completas sin navegador
 * (`tests/sim/headless-battle.spec.ts`) con dos jugadores guionizados. Contra
 * la apertura estándar —tres recolectores, luego soldados, atacar al reunir
 * cinco— sobre diez semillas fijas:
 *
 *      Normal      10 / 10 victorias del jugador
 *      Difícil      3 / 10
 *      Imposible    0 / 10
 *
 * Y contra una política mejor —cuatro recolectores, acumular hasta catorce
 * soldados y replegarse si el ataque se desangra— Imposible cae 9 de cada 10.
 * Esa segunda cifra importa tanto como la primera: Imposible debe ser duro,
 * no un muro. Se gana con paciencia y masa, que es justo lo que el juego
 * quiere enseñar.
 */

/** Parámetros de comportamiento de la IA. Todos son decisiones, no ventajas. */
export interface AiProfile {
  readonly id: DifficultyId;
  /** Nombre mostrado en el menú. */
  readonly label: string;
  /** Una línea que explica al jugador a qué se enfrenta. */
  readonly description: string;

  // --- Economía ---
  /** Recolectores que levanta antes de empezar a producir tropas en serio. */
  readonly harvesterTarget: number;
  /** Recolectores máximos que llegará a tener. */
  readonly harvesterMax: number;
  /**
   * Soldados por recolector que exige antes de volver a ampliar la economía.
   * Un valor bajo hace una IA que invierte pronto; uno alto, una que se
   * queda corta de economía y acaba superada en producción.
   */
  readonly armyPerHarvester: number;

  // --- Reacción ---
  /** Segundos entre decisiones. Cuanto menor, más rápido se adapta. */
  readonly thinkInterval: number;
  /** Segundos que tarda en reaccionar a una invasión de su territorio. */
  readonly reactionDelay: number;

  // --- Agresión ---
  /**
   * Ventaja de poder que exige para lanzarse: ataca solo si su poder ≥ este
   * factor × el del jugador.
   *
   * Es un umbral de **prudencia**, no de ganas de pelea: cuanto más alto, más
   * selectiva es la IA. Y en este juego la prudencia es la jugada correcta,
   * porque el soldado estadounidense supera en alcance al guerrillero: entrar
   * a goteo en una línea defensiva preparada es regalar el ejército. Por eso
   * el perfil bueno exige más ventaja que el malo, y no al revés.
   */
  readonly aggressionRatio: number;
  /** Tropas mínimas antes de plantearse siquiera atacar. */
  readonly minArmyToAttack: number;
  /** Segundos de empuje antes de reevaluar la situación. */
  readonly pushDuration: number;
  /**
   * Aborta el empuje si su poder cae por debajo de este factor × el del
   * jugador. 0 = no aborta nunca, se deja el ataque hasta el último hombre.
   *
   * Es lo que distingue "desperdiciar pocos recursos" de no desperdiciarlos:
   * un ataque que ya se ha torcido se corta y la tropa superviviente vuelve a
   * casa a sumarse a la siguiente oleada, en vez de morir de tres en tres.
   */
  readonly retreatRatio: number;
  /** Si el jugador cruza esta distancia de su base, se repliega a defender. */
  readonly defenseLineOffset: number;

  /**
   * Probabilidad de cometer un error en cada decisión (0 = juego perfecto).
   *
   * Un error es una de dos cosas: saltarse una compra que tocaba, o lanzar un
   * ataque sin la ventaja que su propio umbral exige. Es lo que hace que
   * Normal se sienta como un rival humano despistado y no como una versión
   * ralentizada de Imposible.
   */
  readonly mistakeChance: number;
}

/**
 * Normal — un rival que juega bien a ratos.
 *
 * Su error de fondo es el más humano de todos: **se queda corto de economía**.
 * Con dos porteadores ingresa ~1,1 suministros/s y un guerrillero cada 3,2 s
 * cuesta ~1,6/s, así que no puede llenar su propia cola de entrenamiento y
 * produce a dos tercios del ritmo que el mapa le permitiría. Encima tarda 2,5 s
 * en darse cuenta de que le han entrado en casa y una de cada tres veces deja
 * pasar el turno de compra.
 *
 * No se le ha quitado nada: tiene los mismos depósitos, los mismos precios y el
 * mismo tope de población que los otros dos perfiles. Simplemente los
 * administra peor.
 */
const NORMAL: AiProfile = Object.freeze({
  id: 'normal',
  label: 'Normal',
  description: 'Construye despacio, reacciona tarde y comete errores de criterio.',
  harvesterTarget: 2,
  harvesterMax: 2,
  armyPerHarvester: 3,
  thinkInterval: 1.2,
  reactionDelay: 2.5,
  // Se lanza casi sin ventaja y con tres hombres: el error clásico del
  // jugador impaciente, y la razón principal de que Normal se deje ganar.
  aggressionRatio: 1.15,
  minArmyToAttack: 5,
  pushDuration: 20,
  // Nunca corta un ataque perdido: lo deja correr hasta la última baja.
  retreatRatio: 0,
  defenseLineOffset: 150,
  mistakeChance: 0.3,
});

/**
 * Difícil — administra de verdad.
 *
 * Sube a cuatro porteadores, con lo que ya cubre su cola de producción, y
 * aprende lo que Normal no sabe: no entrar a goteo. Espera a tener seis
 * hombres y algo de ventaja, y si el empuje se tuerce lo corta y vuelve a
 * casa en lugar de morir a plazos.
 */
const HARD: AiProfile = Object.freeze({
  id: 'hard',
  label: 'Difícil',
  description: 'Amplía la economía deprisa y elige mejor el momento de atacar.',
  harvesterTarget: 3,
  harvesterMax: 4,
  armyPerHarvester: 2,
  thinkInterval: 0.6,
  reactionDelay: 1.8,
  aggressionRatio: 1.15,
  minArmyToAttack: 6,
  pushDuration: 24,
  retreatRatio: 0.5,
  defenseLineOffset: 175,
  mistakeChance: 0.18,
});

/**
 * Imposible — no desperdicia nada.
 *
 * Prioriza economía al principio, no deja la ranura de entrenamiento vacía,
 * acumula hasta tener superioridad real antes de empujar, corta el empuje si
 * se tuerce y se da la vuelta al instante en cuanto le pisan el territorio.
 * Sigue pagando cada guerrillero con suministros recolectados.
 */
const IMPOSSIBLE: AiProfile = Object.freeze({
  id: 'impossible',
  label: 'Imposible',
  description: 'Optimiza cada suministro y responde al instante a tus movimientos.',
  harvesterTarget: 4,
  harvesterMax: 5,
  armyPerHarvester: 2,
  thinkInterval: 0.3,
  reactionDelay: 0.25,
  // Acumula hasta tener una superioridad clara y entonces se vuelca entera.
  // Diez guerrilleros llegando a la vez rompen la línea; los mismos diez de
  // tres en tres mueren de tres en tres.
  aggressionRatio: 1.3,
  minArmyToAttack: 8,
  pushDuration: 30,
  retreatRatio: 0.65,
  defenseLineOffset: 230,
  mistakeChance: 0,
});

export const AI_PROFILES: Readonly<Record<DifficultyId, AiProfile>> = Object.freeze({
  normal: NORMAL,
  hard: HARD,
  impossible: IMPOSSIBLE,
});

/** Orden en el que se ofrecen las dificultades en el menú. */
export const DIFFICULTY_ORDER: readonly DifficultyId[] = Object.freeze([
  'normal',
  'hard',
  'impossible',
]);

/** Acceso seguro al catálogo de dificultades. */
export function getAiProfile(id: DifficultyId): AiProfile {
  const profile = AI_PROFILES[id];
  if (!profile) throw new Error(`Dificultad desconocida: "${id}"`);
  return profile;
}

/** `true` si la cadena es una dificultad válida (para leerla de la URL o del disco). */
export function isDifficultyId(value: unknown): value is DifficultyId {
  return typeof value === 'string' && value in AI_PROFILES;
}
