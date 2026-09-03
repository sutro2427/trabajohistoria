import type { Stance, TeamId } from './balance/types.js';

/**
 * Contrato tipado de todo lo que la simulación puede anunciar.
 *
 * Este archivo es la frontera del dominio: la interfaz, los efectos visuales y
 * el audio se suscriben a estos eventos y nunca leen el mundo directamente.
 * Si algún día se añade sonido, será un oyente más — sin tocar la simulación.
 */
/*
 * Se declara como alias de tipo y no como `interface` a propósito: TypeScript
 * solo considera que un alias con miembros literales satisface la restricción
 * `Record<string, unknown>` del bus. Con `interface` el genérico no compila.
 */
export type GameEvents = {
  /** Una unidad ha aparecido en el campo. */
  'unit:spawned': { entityId: number; defId: string; team: TeamId; x: number; y: number };

  /** Una unidad ha muerto. */
  'unit:died': { entityId: number; defId: string; team: TeamId; x: number; y: number };

  /** Se ha aplicado daño a una entidad (unidad o estructura). */
  'damage:dealt': {
    targetId: number;
    amount: number;
    x: number;
    y: number;
    killed: boolean;
  };

  /** Alguien ha disparado: origen del fogonazo y hacia dónde mira. */
  'weapon:fired': { entityId: number; muzzleX: number; muzzleY: number; facing: 1 | -1 };

  /** Un proyectil ha impactado (en un blanco o en el suelo). */
  'projectile:hit': { x: number; y: number; splashRadius: number };

  /** Han cambiado los suministros de un bando. */
  'supplies:changed': { team: TeamId; value: number; delta: number };

  /** Ha cambiado la población de un bando. */
  'population:changed': { team: TeamId; current: number; max: number };

  /** Un recolector ha depositado su carga en la base. */
  'harvest:delivered': { entityId: number; amount: number; x: number; y: number };

  /** Se ha emitido una orden de escuadra. */
  'stance:changed': { team: TeamId; stance: Stance };

  /** Ha entrado una unidad en la cola de entrenamiento. */
  'training:queued': { team: TeamId; defId: string; trainTime: number };

  /** Se ha rechazado una compra (falta de suministros o de población). */
  'training:rejected': {
    team: TeamId;
    defId: string;
    reason: 'supplies' | 'population' | 'locked' | 'queue';
  };

  /** Se ha lanzado un poder sobre el mapa. */
  'power:launched': {
    team: TeamId;
    powerId: string;
    x: number;
    halfWidth: number;
    delay: number;
  };

  /** Se ha rechazado el lanzamiento de un poder. */
  'power:rejected': { team: TeamId; powerId: string; reason: 'supplies' | 'cooldown' };

  /** Una estructura ha sido destruida. */
  'structure:destroyed': { entityId: number; team: TeamId; x: number; y: number };

  /** La partida ha terminado. */
  'level:ended': { won: boolean; loot: number; elapsed: number; levelId: number };
};
