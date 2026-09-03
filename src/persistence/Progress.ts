/**
 * Progreso persistente de la campaña.
 *
 * Es un objeto plano y serializable a propósito: cambiar de localStorage a
 * Firebase no debe requerir tocar nada más que la implementación del repositorio.
 */
export interface Progress {
  /** Nivel más alto desbloqueado. */
  unlockedLevel: number;
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
    tankBlueprintUnlocked: false,
    loot: 0,
    bestTimeSec: {},
    victories: 0,
  };
}
