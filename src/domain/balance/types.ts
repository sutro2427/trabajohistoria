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

/**
 * Rol funcional de una unidad; decide qué componentes recibe al crearse y
 * cómo la busca la IA cuando compone su ejército.
 *
 * `marksman` (francotirador) es un rol propio y no una variante de
 * `infantry` porque su comportamiento táctico es opuesto: la infantería
 * quiere cerrar distancia y el francotirador quiere mantenerla. Separarlos
 * permite que cada uno tenga su propia regla de posicionamiento sin llenar
 * los estados de condicionales.
 */
export type UnitRole = 'infantry' | 'harvester' | 'vehicle' | 'marksman';

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
  /**
   * Distancia que la unidad intenta mantener respecto a su objetivo, como
   * fracción de su alcance (0..1).
   *
   * La infantería lo deja sin definir y avanza hasta el borde del alcance.
   * El francotirador usa un valor alto (~0.9) para quedarse atrás y disparar
   * desde lejos: es lo que lo hace sentirse como un francotirador y no como
   * un soldado con más daño.
   */
  readonly preferredRangeFactor?: number;
  /** Tecla de atajo mostrada en el botón de compra. */
  readonly hotkey?: string;
}

// ---------------------------------------------------------------------------
// Poderes: acciones puntuales que el jugador compra y lanza sobre el mapa
// ---------------------------------------------------------------------------

/**
 * Definición de un poder activable (por ejemplo, las bombas de racimo).
 *
 * No es una unidad: no ocupa población, no camina y no se le puede disparar.
 * Es una compra puntual que convierte suministros en daño inmediato en un
 * punto elegido por el jugador. Existe precisamente para tensar la decisión
 * económica del juego: el mismo dinero son bombas o son soldados.
 */
export interface PowerDef {
  readonly id: string;
  readonly name: string;
  readonly team: TeamId;
  /** Coste en suministros. */
  readonly cost: number;
  /** Segundos de espera antes de poder volver a usarlo. */
  readonly cooldown: number;
  /** Semiancho de la zona batida, en píxeles. */
  readonly areaHalfWidth: number;
  /** Número de explosiones que caen repartidas por la zona. */
  readonly blastCount: number;
  /** Daño de cada explosión. */
  readonly damagePerBlast: number;
  /** Radio de cada explosión concreta. */
  readonly blastRadius: number;
  /** Segundos entre la orden y la primera explosión (la andanada tarda en llegar). */
  readonly delay: number;
  /** Segundos entre explosiones sucesivas. */
  readonly blastInterval: number;
  /** Tecla de atajo. */
  readonly hotkey?: string;
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
  /** Poderes disponibles para el jugador en este nivel. */
  readonly powers: readonly string[];
  /**
   * Dificultad de la IA propia del nivel.
   *
   * La curva de la campaña la fija el nivel, no el jugador: el nivel 1 debe
   * ser accesible para quien nunca ha jugado y el 3 debe costar. Así la
   * competencia de clase compara a todos bajo las mismas condiciones.
   */
  readonly difficulty: string;
  /** Resumen de una línea de lo que introduce el nivel, para el menú. */
  readonly tagline: string;
}
