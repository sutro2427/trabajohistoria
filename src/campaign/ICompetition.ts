import type { ScoreEntry } from './CampaignRun.js';

/**
 * ============================================================================
 * COMPETENCIA — contrato de la sala compartida
 * ============================================================================
 *
 * El juego depende de esta interfaz, nunca de Firebase. Dos consecuencias
 * prácticas y deliberadas:
 *
 *  1. **El juego funciona sin red.** Si no hay configuración de Firebase, o si
 *     el aula se queda sin internet en mitad de la presentación, se enchufa la
 *     implementación local y todo sigue jugándose. Lo único que se pierde es
 *     el panel compartido.
 *  2. **Se puede probar.** Un test puede simular una clase entera de alumnos
 *     sin tocar la red.
 */

/** Estado de la sala. */
export type LobbyState = 'lobby' | 'running' | 'finished';

/** Un participante tal como lo ve la sala. */
export interface Participant {
  readonly id: string;
  readonly name: string;
  readonly ready: boolean;
  readonly joinedAt: number;
  /** Progreso publicado; `null` mientras no ha empezado a jugar. */
  readonly score: ScoreEntry | null;
}

/** Instantánea completa de la sala. */
export interface LobbySnapshot {
  readonly state: LobbyState;
  /** Marca de tiempo de la salida, si ya se dio. */
  readonly startedAt: number | null;
  readonly participants: readonly Participant[];
}

/** Cancela una suscripción. */
export type Unsubscribe = () => void;

export interface ICompetition {
  /** `true` si hay un servidor detrás; `false` en el modo local sin red. */
  readonly online: boolean;

  /**
   * Por qué se está jugando sin sala compartida, o `null` si sí la hay.
   *
   * Existe porque el fallo tiene dos causas muy distintas y hasta ahora las
   * dos se veían igual —un genérico "sin conexión"— cuando la solución de cada
   * una está en un sitio distinto: o falta la configuración en el despliegue,
   * o está puesta y no se llega al servidor. Un despliegue sin las variables
   * de entorno cae en modo local **en silencio**, y esa es exactamente la
   * clase de fallo que se descubre en mitad de la clase.
   */
  readonly offlineReason: string | null;

  /**
   * Entra en la sala con un nombre.
   * @returns el identificador del participante, o un error si el nombre ya existe.
   */
  join(name: string): Promise<{ ok: true; id: string } | { ok: false; reason: string }>;

  /** Marca al jugador como listo para empezar. */
  setReady(ready: boolean): Promise<void>;

  /** Publica el progreso del jugador. Se llama al terminar cada nivel. */
  publish(score: ScoreEntry): Promise<void>;

  /** Observa la sala. El callback se dispara con cada cambio. */
  subscribe(onChange: (snapshot: LobbySnapshot) => void): Unsubscribe;

  /** Da la salida a todos. Solo el profesor. */
  startCompetition(): Promise<void>;

  /**
   * Saca a un participante de la sala. Solo el profesor.
   *
   * Existe por un motivo muy concreto de aula: por muchos filtros que tenga la
   * validación de nombres, siempre habrá quien entre como algo que el profesor
   * no quiere proyectado delante de la clase. Tener que reiniciar la sala
   * entera —y con ella el progreso de los treinta— por un solo nombre sería
   * desproporcionado.
   */
  removeParticipant(id: string): Promise<void>;

  /** Reinicia la sala para otra tanda. Solo el profesor. */
  resetCompetition(): Promise<void>;

  /** Suelta recursos y suscripciones. */
  dispose(): void;
}
