import { TOTAL_LEVELS } from '../domain/balance/levels.js';
import { rankEntries, type ScoreEntry } from './CampaignRun.js';
import type { LobbySnapshot } from './ICompetition.js';

/**
 * ============================================================================
 * ESTADÍSTICAS DE SALA — lo que se proyecta mientras la clase juega
 * ============================================================================
 *
 * Función pura sobre la instantánea de la sala: sin DOM y sin red, igual que
 * el resto de `campaign/`. Así el panel se puede comprobar en un test sin
 * abrir un navegador, y la vista se limita a pintar lo que esta función
 * calcula — que es todo el reparto de responsabilidades que hace falta aquí.
 */

/** Fila del panel, con el puesto ya resuelto. */
export interface RoomRow {
  /** Puesto en la clasificación, empezando en 1. */
  readonly position: number;
  /** Identificador del participante; el panel lo necesita para expulsarlo. */
  readonly id: string | null;
  readonly name: string;
  readonly levelsDone: number;
  readonly seconds: number;
  readonly defeats: number;
  readonly finished: boolean;
  /** `true` si aún no ha superado ningún nivel. */
  readonly idle: boolean;
}

export interface RoomStats {
  readonly rows: readonly RoomRow[];
  /** Inscritos en la sala. */
  readonly total: number;
  /** Han superado al menos un nivel y no han terminado. */
  readonly playing: number;
  /** Han completado las tres operaciones. */
  readonly finished: number;
  /** Nombre del primero que completó la campaña, si ya hay ganador. */
  readonly champion: string | null;
  /** Niveles superados sumando toda la clase: mide el avance del grupo. */
  readonly levelsCleared: number;
  /** Derrotas acumuladas por toda la clase. */
  readonly defeats: number;
}

/**
 * Convierte la instantánea de la sala en las cifras del panel.
 *
 * Los participantes que aún no han publicado nada entran igualmente con cero
 * niveles: en una proyección, un alumno que no aparece en pantalla cree que
 * el sistema le ha perdido.
 */
export function computeRoomStats(snapshot: LobbySnapshot): RoomStats {
  const entries: ScoreEntry[] = snapshot.participants.map(
    (p) =>
      p.score ?? {
        name: p.name,
        levelsDone: 0,
        seconds: 0,
        finishedAt: null,
        defeats: 0,
        updatedAt: p.joinedAt,
      },
  );

  // El identificador no viaja en la puntuación —que se mantiene pequeña a
  // propósito porque cruza la red en cada cambio—, así que se recupera por
  // nombre, que en una sala es único por construcción: el documento de cada
  // alumno se guarda bajo su nombre normalizado.
  const idByName = new Map(snapshot.participants.map((p) => [p.name, p.id]));

  const ranked = rankEntries(entries);

  const rows: RoomRow[] = ranked.map((entry, index) => ({
    position: index + 1,
    id: idByName.get(entry.name) ?? null,
    name: entry.name,
    levelsDone: entry.levelsDone,
    seconds: entry.seconds,
    defeats: entry.defeats,
    finished: entry.levelsDone >= TOTAL_LEVELS,
    idle: entry.levelsDone === 0,
  }));

  const finished = rows.filter((r) => r.finished);

  return {
    rows,
    total: rows.length,
    playing: rows.filter((r) => !r.finished && !r.idle).length,
    finished: finished.length,
    // `rankEntries` ya ordena por quién terminó antes, así que el primero de
    // los que han terminado es el ganador del premio.
    champion: finished[0]?.name ?? null,
    levelsCleared: rows.reduce((acc, r) => acc + r.levelsDone, 0),
    defeats: rows.reduce((acc, r) => acc + r.defeats, 0),
  };
}
