/**
 * Contratos de datos del catálogo de balance.
 *
 * Todo el juego es *data-driven*: los sistemas leen estas definiciones y no
 * conocen ninguna unidad concreta. Añadir el tanque del nivel 2 consiste en
 * añadir un registro a `balance.ts` y una receta de sprite — ni un `switch`
 * ni un `if` nuevo en los sistemas. Eso es el Principio Abierto/Cerrado.
 */

/** Bandos en liza. */
export type TeamId = 'US' | 'VC';

/** Postura del ejército. Una sola variable produce comportamiento de escuadra. */
export type Stance = 'attack' | 'defend' | 'retreat';

/** Rol funcional de una unidad; decide qué componentes recibe al crearse. */
export type UnitRole = 'infantry' | 'harvester' | 'vehicle';

/**
 * Parámetros del ciclo de recolección (solo unidades con rol `harvester`).
 *
 * La *distancia* al depósito ya no vive aquí: los depósitos son entidades del
 * mundo (`ResourceNode`) repartidas por el mapa, y cada recolector elige el
 * suyo. Lo que queda en la definición de la unidad es únicamente el ritmo con
 * el que trabaja, que es lo que de verdad la caracteriza.
 */
export interface HarvestDef {
  /** Segundos por cada unidad de suministro recogida (una animación de acopio). */
  readonly gatherTime: number;
  /** Suministros que carga antes de volver a depositar. */
  readonly carryCapacity: number;
}

/** Definición completa de un tipo de unidad. */
export interface UnitDef {
  readonly id: string;
  /** Nombre mostrado en la interfaz, en español. */
  readonly name: string;
  readonly team: TeamId;
  readonly role: UnitRole;

  // --- Supervivencia ---
  readonly hp: number;
  /** Reducción plana de daño. El daño real es `max(minDamage, daño - armadura)`. */
  readonly armor: number;

  // --- Ofensiva (0 en unidades sin arma) ---
  readonly damage: number;
  /** Disparos por segundo. */
  readonly fireRate: number;
  /** Alcance del arma en píxeles lógicos. */
  readonly range: number;
  /** Segundos apuntando antes del primer disparo tras entrar en contacto. */
  readonly aimTime: number;
  readonly projectileSpeed: number;
  /** Dispersión vertical del disparo, en píxeles. Genera fallos creíbles. */
  readonly spread: number;
  /** Radio de daño en área. 0 = impacto puntual. */
  readonly splashRadius: number;

  // --- Movimiento y coste ---
  readonly speed: number;
  readonly cost: number;
  readonly trainTime: number;
  readonly population: number;

  // --- Reacción al daño ---
  /** Segundos de aturdimiento al recibir un impacto. */
  readonly flinchDuration: number;
  /**
   * Segundos mínimos entre dos aturdimientos.
   * Sin este margen, el fuego sostenido dejaría a la unidad paralizada
   * indefinidamente — un bug clásico de los juegos con reacción a impactos.
   */
  readonly flinchCooldown: number;
  /** Segundos que el cadáver permanece en pantalla antes de desvanecerse. */
  readonly corpseFade: number;

  // --- Presentación ---
  /** Píxeles que el arma retrocede al disparar. */
  readonly recoilPixels: number;
  /** Alto aproximado en píxeles; se usa para colocar la barra de vida. */
  readonly spriteHeight: number;

  // --- Opcionales por rol ---
  readonly harvest?: HarvestDef;
  /** Si es `true`, requiere haber capturado los planos para poder producirse. */
  readonly requiresBlueprint?: boolean;
}

/** Definición de una estructura (base propia u objetivo enemigo). */
export interface StructureDef {
  readonly id: string;
  readonly name: string;
  readonly team: TeamId;
  readonly hp: number;
  readonly width: number;
  readonly height: number;
}

/** Definición de un nivel de la campaña. */
export interface LevelDef {
  readonly id: number;
  readonly title: string;
  /** Texto de sesión informativa mostrado en el menú principal. */
  readonly briefing: string;
  /** Descripción corta del objetivo, para el HUD. */
  readonly objective: string;
  /**
   * Suministros iniciales. Los reciben **ambos** bandos: la IA juega con la
   * misma economía que el jugador, no con una renta regalada.
   */
  readonly startingSupplies: number;
  /** Tope de población, idéntico para los dos bandos. */
  readonly populationMax: number;
  /** Unidades enemigas presentes al comenzar (guarnición de la posición). */
  readonly garrison: readonly string[];
  /** Unidades que el jugador puede producir en este nivel. */
  readonly buildable: readonly string[];
  /** Unidades que la IA puede producir. Mismo mecanismo de compra que el jugador. */
  readonly enemyBuildable: readonly string[];
  readonly playerStructure: string;
  readonly enemyStructure: string;
  /** Botín máximo que se traslada al nivel siguiente. */
  readonly maxLoot: number;
}
