import type { StructureDef, UnitDef } from './types.js';

/**
 * ============================================================================
 * CATÁLOGO DE BALANCE — fuente única de verdad numérica del juego
 * ============================================================================
 *
 * Ningún otro archivo debe contener una constante de juego. Ajustar la
 * dificultad, el ritmo o la economía se hace aquí y solo aquí.
 *
 * Unidades de medida:
 *   · tiempos      → segundos
 *   · distancias   → píxeles lógicos (la pantalla lógica mide 480×270)
 *   · daño y vida  → puntos de vida
 */

/** Geometría del campo de batalla. */
export const WORLD = Object.freeze({
  /** Resolución lógica; se escala con enteros para que el pixel art no se deforme. */
  logicalWidth: 480,
  logicalHeight: 270,
  /** El mundo es casi cinco pantallas de ancho: avanzar se nota. */
  battlefieldWidth: 2200,
  /** Línea de suelo sobre la que caminan todas las unidades. */
  groundY: 206,
  /**
   * Dispersión vertical aleatoria alrededor de la línea de suelo. Da profundidad
   * al carril y determina el orden de dibujo (los de abajo se pintan encima).
   */
  laneJitter: 7,
  /** Posición de la base estadounidense (izquierda). */
  usBaseX: 140,
  /** Posición del puesto de mando vietnamita (derecha). */
  vcBaseX: 2060,
  /** Separación mínima entre unidades para que no se apilen en el mismo píxel. */
  unitSeparation: 11,
  /** Distancia a la que una unidad se detiene frente a su objetivo estructural. */
  structureStandoff: 26,
});

/** Reglas de economía y producción. */
export const ECONOMY = Object.freeze({
  /**
   * Una sola ranura de entrenamiento.
   *
   * Este es el verdadero regulador del ritmo. Con el soldado a 3 y el
   * recolector a 4, dos recolectores financian cualquier ejército; si la
   * producción fuera paralela, el dinero dejaría de importar. La cola de una
   * ranura convierte el tiempo —no el coste— en el recurso escaso, que es
   * exactamente cómo se siente Stick War.
   */
  trainQueueSlots: 1,
  /** Los suministros no pueden bajar de aquí. */
  minSupplies: 0,
});

/** Reglas generales de combate. */
export const COMBAT = Object.freeze({
  /**
   * A partir de `rango × este factor` la unidad deja de avanzar y se prepara.
   * El margen evita el "baile" de unidades que entran y salen del alcance.
   */
  engageRangeFactor: 1.35,
  /**
   * Daño mínimo por impacto.
   *
   * Sin este suelo, una unidad con armadura ≥ daño sería literalmente
   * invulnerable al rifle y la partida se quedaría bloqueada para siempre.
   */
  minDamage: 1,
  /** Sin fuego amigo: en un juego de escuadras automático solo genera frustración. */
  friendlyFire: false,
  /** Segundos que una bala vive antes de desaparecer si no impacta. */
  projectileLifetime: 2.0,
  /** Probabilidad de acierto base; el resto de disparos se van desviados. */
  accuracy: 0.85,
});

/**
 * ---------------------------------------------------------------------------
 * UNIDADES
 * ---------------------------------------------------------------------------
 *
 * Notas de diseño sobre el duelo básico (soldado US contra guerrillero VC):
 *
 *   Soldado US   : 12 daño × 1.4 disparos/s = 16.8 DPS → mata 90 HP en 5.4 s
 *   Guerrillero  : 10 daño × 1.5 disparos/s = 15.0 DPS → mata 100 HP en 6.7 s
 *
 * El estadounidense gana el duelo puro, pero el guerrillero es un 12 % más
 * rápido y la IA cobra renta gratuita. La ventaja del jugador debe salir de
 * las órdenes de escuadra y de la economía, no de las estadísticas.
 *
 * Los 6 px de ventaja de alcance (90 contra 84) son lo que da función mecánica
 * real al botón DEFENDER: en posición defensiva disparas primero.
 */
export const UNITS: Readonly<Record<string, UnitDef>> = Object.freeze({
  // ======================= BANDO ESTADOUNIDENSE =======================

  us_rifleman: Object.freeze({
    id: 'us_rifleman',
    name: 'Soldado',
    team: 'US',
    role: 'infantry',
    hp: 100,
    armor: 0,
    damage: 12,
    fireRate: 1.4,
    range: 90,
    aimTime: 0.35,
    projectileSpeed: 420,
    spread: 3,
    splashRadius: 0,
    speed: 34,
    cost: 3,
    trainTime: 3.0,
    population: 1,
    flinchDuration: 0.18,
    flinchCooldown: 0.9,
    corpseFade: 2.5,
    recoilPixels: 2,
    spriteHeight: 20,
  }),

  us_harvester: Object.freeze({
    id: 'us_harvester',
    name: 'Recolector',
    team: 'US',
    role: 'harvester',
    hp: 60,
    armor: 0,
    damage: 0,
    fireRate: 0,
    range: 0,
    aimTime: 0,
    projectileSpeed: 0,
    spread: 0,
    splashRadius: 0,
    speed: 45,
    cost: 4,
    trainTime: 4.0,
    population: 1,
    flinchDuration: 0.25,
    flinchCooldown: 1.2,
    corpseFade: 2.5,
    recoilPixels: 0,
    spriteHeight: 20,
    /**
     * Ciclo de recolección, calibrado para la tasa pedida de 1 suministro / 2 s:
     *
     *   ida      90 px ÷ 45 px/s        = 2.00 s
     *   acopio   3 cargas × 0.70 s      = 2.10 s
     *   vuelta   90 px ÷ 45 px/s        = 2.00 s
     *   ──────────────────────────────────────────
     *   total    6.10 s por 3 suministros = 2.03 s/suministro ✓
     *
     * Se prefiere un ciclo largo con carga de 3 antes que uno corto de 1
     * porque el viaje es *visible*: el recolector sale del campamento hacia la
     * retaguardia, se agacha a cargar y vuelve. Igual que el minero de Stick
     * War, es una unidad que se ve trabajar y que se puede perder.
     */
    harvest: Object.freeze({
      nodeOffsetX: -90,
      gatherTime: 0.7,
      carryCapacity: 3,
    }),
  }),

  us_tank: Object.freeze({
    id: 'us_tank',
    name: 'Tanque M48',
    team: 'US',
    role: 'vehicle',
    hp: 900,
    armor: 4,
    damage: 55,
    fireRate: 0.5,
    range: 150,
    aimTime: 0.6,
    projectileSpeed: 300,
    spread: 1,
    splashRadius: 26,
    speed: 18,
    cost: 500,
    trainTime: 20.0,
    population: 4,
    // Un vehículo no se tambalea por un disparo de rifle.
    flinchDuration: 0,
    flinchCooldown: 999,
    corpseFade: 6.0,
    recoilPixels: 4,
    spriteHeight: 22,
    requiresBlueprint: true,
  }),

  // ======================= BANDO VIETNAMITA =======================

  vc_guerrilla: Object.freeze({
    id: 'vc_guerrilla',
    name: 'Guerrillero',
    team: 'VC',
    role: 'infantry',
    hp: 90,
    armor: 0,
    damage: 10,
    fireRate: 1.5,
    range: 84,
    aimTime: 0.3,
    projectileSpeed: 400,
    spread: 4,
    splashRadius: 0,
    speed: 38,
    cost: 3,
    trainTime: 3.2,
    population: 1,
    flinchDuration: 0.18,
    flinchCooldown: 0.9,
    corpseFade: 2.5,
    recoilPixels: 2,
    spriteHeight: 20,
  }),

  vc_tank: Object.freeze({
    id: 'vc_tank',
    name: 'Tanque T-54',
    team: 'VC',
    role: 'vehicle',
    hp: 950,
    armor: 4,
    damage: 50,
    fireRate: 0.5,
    range: 145,
    aimTime: 0.6,
    projectileSpeed: 300,
    spread: 1,
    splashRadius: 26,
    speed: 16,
    cost: 0,
    trainTime: 0,
    population: 4,
    flinchDuration: 0,
    flinchCooldown: 999,
    corpseFade: 6.0,
    recoilPixels: 4,
    spriteHeight: 22,
  }),
});

/**
 * ---------------------------------------------------------------------------
 * ESTRUCTURAS
 * ---------------------------------------------------------------------------
 *
 * El puesto de mando a 900 HP está calibrado así: dos soldados supervivientes
 * lo derriban en ~27 s, una escuadra de cinco en ~11 s. Suficiente para que la
 * orden ATACAR se sienta decisiva sin que el nivel se gane de un empujón.
 */
export const STRUCTURES: Readonly<Record<string, StructureDef>> = Object.freeze({
  us_firebase: Object.freeze({
    id: 'us_firebase',
    name: 'Base de Fuego Delta',
    team: 'US',
    hp: 1500,
    width: 60,
    height: 46,
  }),
  vc_outpost: Object.freeze({
    id: 'vc_outpost',
    name: 'Puesto de Mando',
    team: 'VC',
    hp: 900,
    width: 54,
    height: 42,
  }),
  vc_bunker: Object.freeze({
    id: 'vc_bunker',
    name: 'Búnker de Mando',
    team: 'VC',
    hp: 1400,
    width: 58,
    height: 46,
  }),
});

/** Acceso seguro al catálogo: falla ruidosamente ante un identificador inválido. */
export function getUnitDef(id: string): UnitDef {
  const def = UNITS[id];
  if (!def) throw new Error(`Unidad desconocida en el catálogo: "${id}"`);
  return def;
}

export function getStructureDef(id: string): StructureDef {
  const def = STRUCTURES[id];
  if (!def) throw new Error(`Estructura desconocida en el catálogo: "${id}"`);
  return def;
}

/**
 * Suministros por segundo que aporta un recolector, deducidos de su definición.
 *
 * Se calcula en lugar de escribirse a mano para que la cifra que muestran la
 * interfaz y los tests no pueda desincronizarse del balance real.
 */
export function harvesterIncomePerSecond(def: UnitDef): number {
  const h = def.harvest;
  if (!h || def.speed <= 0) return 0;
  const travel = (Math.abs(h.nodeOffsetX) / def.speed) * 2;
  const gathering = h.gatherTime * h.carryCapacity;
  return h.carryCapacity / (travel + gathering);
}
