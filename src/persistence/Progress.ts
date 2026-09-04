import type { CampaignRun } from '../campaign/CampaignRun.js';
import type { DifficultyId } from '../domain/balance/difficulty.js';

/**
 * Progreso persistente de la campaña.
 *
 * Es un objeto plano y serializable a propósito: cambiar de localStorage a
 * Firebase no debe requerir tocar nada más que la implementación del repositorio.
 */
export interface Progress {
  /** Nivel más alto desbloqueado. */
  unlockedLevel: number;
  /**
   * Última dificultad elegida en el menú.
   *
   * Se guarda para que el menú abra ya en la que el jugador venía jugando: en
   * una partida de tres minutos, volver a marcar Imposible cada vez sería una
   * fricción absurda.
   */
  difficulty: DifficultyId;
  /** `true` cuando se han capturado los planos del tanque (premio del nivel 1). */
  tankBlueprintUnlocked: boolean;
  /** Botín acumulado que se traslada al nivel siguiente. */
  loot: number;
  /** Mejor tiempo por nivel, en segundos. */
  bestTimeSec: Record<string, number>;
  /** Partidas ganadas en total. */
  victories: number;
  /**
   * Campaña a medias que se puede retomar, o `null` si no hay ninguna.
   *
   * Es lo que permite salir al menú en mitad de la segunda operación y volver
   * donde se dejó, en vez de perder el intento. Se guarda el objeto de campaña
   * entero —nombre, operación en curso, resultados y derrotas— porque ya es
   * una estructura plana y serializable: no hace falta ni convertirlo.
   *
   * Se borra al completar la campaña y al empezar con otro nombre. En un
   * teléfono compartido, eso último importa: el siguiente alumno no debe
   * heredar el intento del anterior.
   */
  savedRun: CampaignRun | null;
}

/** Progreso de una partida nueva. */
export function initialProgress(): Progress {
  return {
    unlockedLevel: 1,
    difficulty: 'normal',
    tankBlueprintUnlocked: false,
    loot: 0,
    bestTimeSec: {},
    victories: 0,
    savedRun: null,
  };
}
