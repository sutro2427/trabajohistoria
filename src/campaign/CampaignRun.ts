import { TOTAL_LEVELS } from '../domain/balance/levels.js';

/**
 * ============================================================================
 * PARTIDA DE CAMPAÑA — el intento de un alumno de completar los tres niveles
 * ============================================================================
 *
 * Es el objeto que la competencia observa: lleva la cuenta de por dónde va
 * cada jugador y acumula las estadísticas que sostienen el mensaje del juego
 * ("la guerra se gana administrando recursos y actuando rápido").
 *
 * Es una estructura de datos pura, sin DOM y sin red: eso permite calcular el
 * ranking y las estadísticas en un test, y que la capa de Firebase sea un mero
 * transporte.
 */

/** Resultado registrado de un nivel superado. */
export interface LevelResult {
  readonly level: number;
  /** Segundos que costó el nivel. */
  readonly seconds: number;
  /** Suministros recolectados durante el nivel. */
  readonly harvested: number;
  /** Suministros que sobraron al terminar: capital que no llegó a trabajar. */
  readonly leftover: number;
  /** Bajas propias. */
  readonly losses: number;
  /** Bajas causadas al enemigo. */
  readonly kills: number;
  /** Suministros invertidos en bombardeos. */
  readonly spentOnPowers: number;
}

export interface CampaignRun {
  readonly playerName: string;
  /** Marca de tiempo de inicio, en milisegundos. */
  readonly startedAt: number;
  /** Nivel que se está jugando ahora (1..TOTAL_LEVELS). */
  currentLevel: number;
  /** Niveles ya superados, en orden. */
  readonly results: LevelResult[];
  /** Intentos fallidos acumulados; el ranking los usa como desempate. */
  defeats: number;
  /** Milisegundos en los que se completó el último nivel. */
  finishedAt: number | null;
}

export function createRun(playerName: string, now: number = Date.now()): CampaignRun {
  return {
    playerName,
    startedAt: now,
    currentLevel: 1,
    results: [],
    defeats: 0,
    finishedAt: null,
  };
}

/** Registra un nivel superado y avanza al siguiente. */
export function recordVictory(
  run: CampaignRun,
  result: LevelResult,
  now: number = Date.now(),
): void {
  run.results.push(result);
  if (run.results.length >= TOTAL_LEVELS) {
    run.finishedAt = now;
  } else {
    run.currentLevel++;
  }
}

export function recordDefeat(run: CampaignRun): void {
  run.defeats++;
}

/** `true` si el jugador ha completado los tres niveles. */
export function isComplete(run: CampaignRun): boolean {
  return run.results.length >= TOTAL_LEVELS;
}

/** Segundos sumados de todos los niveles superados. */
export function totalSeconds(run: CampaignRun): number {
  return run.results.reduce((acc, r) => acc + r.seconds, 0);
}

/**
 * Resumen de gestión de toda la campaña.
 *
 * Estas cifras son la conclusión del juego: al terminar se le muestran al
 * alumno para que vea, con sus propios datos, que ganó administrando y
 * decidiendo rápido, no disparando más.
 */
export interface ManagementSummary {
  /** Suministros totales que pasaron por sus manos. */
  readonly harvested: number;
  /** Suministros que se quedaron sin usar: recursos que no llegaron al frente. */
  readonly leftover: number;
  /**
   * Porcentaje de lo recolectado que llegó a convertirse en algo (0-100).
   * Es la medida directa de la eficiencia con la que administró.
   */
  readonly efficiency: number;
  readonly kills: number;
  readonly losses: number;
  /** Bajas enemigas por cada baja propia. */
  readonly exchangeRatio: number;
  readonly seconds: number;
  readonly defeats: number;
  readonly spentOnPowers: number;
}

export function summarize(run: CampaignRun): ManagementSummary {
  const harvested = run.results.reduce((a, r) => a + r.harvested, 0);
  const leftover = run.results.reduce((a, r) => a + r.leftover, 0);
  const kills = run.results.reduce((a, r) => a + r.kills, 0);
  const losses = run.results.reduce((a, r) => a + r.losses, 0);
  const spentOnPowers = run.results.reduce((a, r) => a + r.spentOnPowers, 0);

  return {
    harvested,
    leftover,
    // Si no recolectó nada la eficiencia es 0, no una división por cero.
    efficiency: harvested > 0 ? Math.round(((harvested - leftover) / harvested) * 100) : 0,
    kills,
    losses,
    exchangeRatio: losses > 0 ? Math.round((kills / losses) * 10) / 10 : kills,
    seconds: totalSeconds(run),
    defeats: run.defeats,
    spentOnPowers,
  };
}

/**
 * Fila del panel compartido: lo mínimo que la competencia necesita publicar.
 * Se mantiene deliberadamente pequeño porque viaja por la red en cada cambio.
 */
export interface ScoreEntry {
  readonly name: string;
  /** Niveles completados (0..TOTAL_LEVELS). */
  readonly levelsDone: number;
  /** Segundos acumulados de los niveles superados. */
  readonly seconds: number;
  /** Marca de tiempo en la que terminó la campaña, si la terminó. */
  readonly finishedAt: number | null;
  readonly defeats: number;
  /** Última señal de vida, para distinguir a quien sigue jugando. */
  readonly updatedAt: number;
}

export function toScoreEntry(run: CampaignRun, now: number = Date.now()): ScoreEntry {
  return {
    name: run.playerName,
    levelsDone: run.results.length,
    seconds: Math.round(totalSeconds(run)),
    finishedAt: run.finishedAt,
    defeats: run.defeats,
    updatedAt: now,
  };
}

/**
 * Orden del ranking, tal como se presenta en clase:
 *
 *  1. Quien ha completado más niveles va delante.
 *  2. A igualdad, quien terminó antes (por marca de tiempo real: gana el
 *     primero que llegó, que es el criterio del premio).
 *  3. Si ninguno ha terminado, menos tiempo de juego acumulado.
 *  4. Y por último, menos derrotas.
 */
export function compareEntries(a: ScoreEntry, b: ScoreEntry): number {
  if (a.levelsDone !== b.levelsDone) return b.levelsDone - a.levelsDone;

  if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
  if (a.finishedAt !== null) return -1;
  if (b.finishedAt !== null) return 1;

  if (a.seconds !== b.seconds) return a.seconds - b.seconds;
  return a.defeats - b.defeats;
}

/** Ordena una tabla de posiciones. No modifica el array original. */
export function rankEntries(entries: readonly ScoreEntry[]): ScoreEntry[] {
  return [...entries].sort(compareEntries);
}
