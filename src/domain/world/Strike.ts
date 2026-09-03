import type { TeamId } from '../balance/types.js';

/**
 * Andanada en curso: una tanda de explosiones que van cayendo sobre una zona.
 *
 * Se modela como una entidad viva del mundo y no como daño instantáneo por
 * dos razones de diseño:
 *
 *  1. **Se puede esquivar.** Entre la orden y el primer impacto pasa un
 *     segundo, y las explosiones caen escalonadas. Un ejército en movimiento
 *     puede salir de la zona, así que lanzar bien exige anticipar.
 *  2. **Se ve.** Un número que baja de golpe no cuenta nada; siete
 *     explosiones sucesivas recorriendo una ladera sí.
 */
export interface Strike {
  readonly id: number;
  /** Bando que la lanzó: sus propias tropas no reciben daño. */
  readonly team: TeamId;
  /** Centro de la zona batida. */
  readonly centerX: number;
  readonly groundY: number;
  readonly halfWidth: number;
  /** Explosiones que faltan por caer. */
  remaining: number;
  /** Segundos hasta la siguiente explosión. */
  timer: number;
  readonly blastInterval: number;
  readonly damagePerBlast: number;
  readonly blastRadius: number;
  alive: boolean;
}

/** Estado de un poder para un bando: enfriamiento y usos. */
export interface PowerState {
  readonly defId: string;
  /** Segundos restantes de enfriamiento. 0 = disponible. */
  cooldown: number;
  /** Veces que se ha usado en la partida; alimenta las estadísticas finales. */
  timesUsed: number;
}

export function createPowerState(defId: string): PowerState {
  return { defId, cooldown: 0, timesUsed: 0 };
}
