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
  };
}
