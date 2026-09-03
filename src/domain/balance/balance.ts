import type { PowerDef, StructureDef, UnitDef } from './types.js';

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

/**
 * Geometría del campo de batalla.
 *
 * El mapa se acortó de 1920 px entre bases a 1000 (un 48 % menos). El motivo
 * es de ritmo, no de estética: con la distancia anterior un soldado tardaba
 * 56 s en cruzar el mapa y la partida se pasaba viendo caminar a la tropa. A
 * 1000 px el mismo trayecto son 29 s, el contacto llega solo y los depósitos
 * quedan al alcance de un contraataque — que es lo que hace que defenderlos
 * sea una decisión y no un trámite.
 */
export const WORLD = Object.freeze({
  /** Resolución lógica; se escala con enteros para que el pixel art no se deforme. */
  logicalWidth: 480,
  logicalHeight: 270,
  /**
   * Ancho lógico máximo que puede llegar a pedir un aparato muy panorámico.
   *
   * La altura es fija y el ancho se adapta al aspecto real de la pantalla (ver
   * `render/Viewport.ts`), así que todo lo que se hornea **una sola vez y no se
   * repite en bucle** —el cielo— tiene que caber en el caso más ancho. Con el
   * cielo horneado a 480 px, un teléfono panorámico veía una franja negra en
   * el borde derecho: la tira sencillamente se acababa.
   */
  maxLogicalWidth: 760,
  /** Poco más de dos pantallas y media: se abarca el frente sin perder la escala. */
  battlefieldWidth: 1260,
  /** Línea de suelo sobre la que caminan todas las unidades. */
  groundY: 206,
  /**
   * Dispersión vertical aleatoria alrededor de la línea de suelo. Da profundidad
   * al carril y determina el orden de dibujo (los de abajo se pintan encima).
   *
   * Se amplió al subir el tope de población: con 50 unidades por bando, una
   * banda estrecha las obligaba a formar una fila de cientos de píxeles. Con
   * 18 px de banda y separación vertical, la misma tropa ocupa cuatro filas.
   */
  laneJitter: 9,
  /** Posición de la base estadounidense (izquierda). */
  usBaseX: 130,
  /** Posición del puesto de mando vietnamita (derecha). */
  vcBaseX: 1130,
  /** Separación horizontal mínima entre unidades del mismo bando. */
  unitSeparation: 11,
  /** Separación vertical mínima. Es lo que convierte la fila en formación. */
  unitSeparationY: 5,
  /**
   * Retranqueo por fila de formación. Cada unidad recibe una ranura fija
   * (0..3) y se coloca esa cantidad de píxeles por detrás del punto que marca
   * la postura, de modo que una escuadra numerosa forma escalones en lugar de
   * amontonarse entera en la misma coordenada.
   */
  formationSpacing: 12,
  /** Número de ranuras de formación. */
  formationSlots: 4,
  /** Distancia a la que una unidad se detiene frente a su objetivo estructural. */
  structureStandoff: 26,

  /**
   * ---------------------------------------------------------------------
   * DEPÓSITOS DE SUMINISTROS
   * ---------------------------------------------------------------------
   *
   * Cinco por bando, escalonados desde la base hacia el centro del mapa:
   *
   *   BASE ─80─▸ ─120─▸ ─162─▸ ─206─▸ ─252─▸ ... ZONA CENTRAL
   *
   * Están separados a propósito. La distancia del primero está elegida para
   * **conservar el ritmo económico anterior**: ida y vuelta de 80 px a 45 px/s
   * más 2,1 s de acopio son 5,66 s por tres suministros, o sea 1,89 s por
   * suministro — los mismos ~2 s de la versión con un único punto de acopio.
   * Los lejanos sostienen la partida larga a costa de un viaje más caro:
   * cuando el cercano se agota la economía no se corta, se encarece. Esa curva
   * es la decisión estratégica que justifica que los depósitos sean finitos.
   *
   * La separación entre uno y otro (40-46 px) es algo mayor que el ancho del
   * sprite: con menos, los cinco se solapaban en pantalla y se leían como un
   * único almacén en lugar de como cinco puntos distintos por los que el
   * recolector se va desplazando.
   */
  resourceOffsets: Object.freeze([80, 120, 162, 206, 252]),
  /**
   * Suministros de cada depósito, en el mismo orden. Crecen con la distancia:
   * el bolsillo cómodo es pequeño y el que aguanta la partida está expuesto,
   * cerca de la tierra de nadie.
   */
  resourceAmounts: Object.freeze([70, 90, 110, 130, 150]),
});

/**
 * Margen con el que la línea defensiva se adelanta al depósito en explotación.
 *
 * La línea **no** es una distancia fija a la base: se calcula en
 * `defenseLineOffset()` a partir del depósito que los recolectores están
 * trabajando en ese momento, y este es el colchón que se le suma.
 *
 * 55 px son algo más de medio alcance de rifle (90 px): suficiente para que el
 * intercambio de disparos ocurra por delante de los porteadores.
 *
 * El valor está medido, no elegido a ojo. Entre 30 y 60 px el resultado es
 * plano —un principiante gana la primera operación 40-44 veces de 60 con
 * cualquiera de ellos—, y a partir de ahí se desploma: con 70 baja a 34 de 60
 * y con 85 la campaña se vuelve otra cosa. El motivo es de tempo, no de
 * combate: cuanto más lejos forma la línea, más tarda en llegar cada refuerzo
 * recién producido, y una tropa que llega de una en una muere de una en una.
 * De ahí que se tome el extremo alto de la meseta y ni un píxel más.
 */
export const DEFENSE_LINE_MARGIN = 55;

/** Reglas de economía y producción. */
export const ECONOMY = Object.freeze({
  /**
   * Una sola ranura de entrenamiento.
   *
   * Sigue siendo el regulador del ritmo, y ahora convive con costes más altos:
   * el tiempo limita *cuántas* unidades salen y el precio limita *si* salen.
   * Antes, con el soldado a 3, dos recolectores financiaban producción
   * ininterrumpida y el dinero dejaba de importar a los treinta segundos.
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
 * rápido. La ventaja del jugador debe salir de las órdenes de escuadra y de la
 * economía, no de las estadísticas.
 *
 * Los 6 px de ventaja de alcance (90 contra 84) son lo que da función mecánica
 * real al botón DEFENDER: en posición defensiva disparas primero.
 *
 * Sobre los costes: soldado 3→5 y recolector 4→6. Tres recolectores rinden
 * ~1,7 suministros/s y un soldado cada 3 s cuesta ~1,7/s, así que la caja
 * queda al filo en lugar de desbordarse. Ese era el problema: se ingresaba
 * mucho más de lo que se podía gastar y el recurso dejaba de decidir nada.
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
    cost: 5,
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
    shortName: 'Recolec.',
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
    cost: 6,
    trainTime: 4.0,
    population: 1,
    flinchDuration: 0.25,
    flinchCooldown: 1.2,
    corpseFade: 2.5,
    recoilPixels: 0,
    spriteHeight: 20,
    /**
     * Ciclo de recolección, sin tocar el ritmo respecto a la versión anterior:
     *
     *   ida      80 px ÷ 45 px/s        = 1.78 s   (al depósito más cercano)
     *   acopio   3 cargas × 0.70 s      = 2.10 s
     *   vuelta   80 px ÷ 45 px/s        = 1.78 s
     *   ──────────────────────────────────────────
     *   total    5.66 s por 3 suministros = 1.89 s/suministro ✓
     *
     * Lo que cambia no es el ritmo sino de dónde sale: la distancia ya no es
     * una constante de la unidad, la pone el depósito concreto al que va. Al
     * agotarse los cercanos, el mismo recolector pasa a 2,2 y luego a 3,4 s
     * por suministro sin que se toque una sola cifra de este bloque.
     */
    harvest: Object.freeze({
      gatherTime: 0.7,
      carryCapacity: 3,
    }),
  }),

  /**
   * Francotirador estadounidense.
   *
   * Su función es cambiar la forma de la batalla, no ganarla sola. Los números
   * están elegidos para que sea un problema *posicional*:
   *
   *   · Alcance 150 px contra los 90 del soldado: dispara desde mucho más
   *     lejos, así que una línea con francotiradores detrás gana el
   *     intercambio a distancia.
   *   · 45 de daño mata a un guerrillero en dos tiros, no en nueve.
   *   · Pero un disparo cada 2 s y 70 de vida: si la infantería enemiga le
   *     llega encima, muere sin poder responder.
   *
   * De ahí la respuesta correcta del jugador: no acumular francotiradores,
   * sino protegerlos con soldados delante.
   *
   * Sobre el precio: la primera versión costaba 14 y ocupaba 2 de población,
   * y las partidas simuladas mostraron por qué estaba mal. Comprar dos valía
   * casi seis soldados y cuatro huecos de población, así que el jugador que
   * los usaba se quedaba con un ejército de cuatro unidades y perdía por
   * agotamiento — el nivel 2 era invencible. A 10 y una población sigue siendo
   * el doble que un soldado, que es decisión suficiente.
   */
  us_sniper: Object.freeze({
    id: 'us_sniper',
    name: 'Francotirador',
    shortName: 'Tirador',
    team: 'US',
    role: 'marksman',
    hp: 70,
    armor: 0,
    /**
     * 95 de daño: mata a un guerrillero (90 de vida) de un solo disparo.
     *
     * Es la cifra que da sentido a la unidad. Con 45 hacía falta disparar dos
     * veces, y a un tiro cada dos segundos eso significaba cuatro segundos por
     * baja: menos rendimiento que un soldado que cuesta la mitad. Las partidas
     * simuladas lo dejaron claro — comprar francotiradores hacía *perder*
     * (0 victorias de 8, frente a 6 de 8 sin ellos). Una unidad que el juego
     * ofrece y que empeora tus opciones es una trampa, no una decisión.
     */
    damage: 95,
    fireRate: 0.5,
    range: 150,
    aimTime: 0.9,
    projectileSpeed: 620,
    spread: 1,
    splashRadius: 0,
    speed: 28,
    cost: 10,
    trainTime: 5.5,
    population: 1,
    flinchDuration: 0.2,
    flinchCooldown: 1.0,
    corpseFade: 2.5,
    recoilPixels: 3,
    spriteHeight: 20,
    /**
     * Se planta al 92 % de su alcance. Con un margen mayor pasaba media
     * batalla retrocediendo —y retrocediendo no dispara—, así que su daño
     * nunca llegaba a aplicarse.
     */
    preferredRangeFactor: 0.92,
    hotkey: '3',
  }),

  /**
   * Tanque M48.
   *
   * El coste anterior (500) era un error de calibración heredado: el mapa
   * entero solo contiene 550 suministros por bando, así que un tanque
   * costaba literalmente toda la partida y nadie podía construirlo nunca.
   *
   * A 55 suministros equivale a once soldados, y con 8 de población ocupa
   * casi una sexta parte del ejército. Sigue siendo la compra más cara del
   * juego —hay que renunciar a mucho— pero es alcanzable con una economía
   * bien llevada, que es exactamente la lección que el juego quiere enseñar.
   *
   * Sobre su alcance (125) frente al del francotirador (150): es deliberado y
   * es la clave del nivel 3. El blindado arrasa infantería, pero el tirador le
   * dispara desde fuera de su alcance. Cada unidad tiene una respuesta clara,
   * así que el nivel se gana componiendo el ejército correcto y no acumulando
   * la unidad más cara. Con el tanque batiendo más lejos que todo lo demás, el
   * nivel era sencillamente imposible: cero victorias de ocho.
   */
  us_tank: Object.freeze({
    id: 'us_tank',
    name: 'Tanque M48',
    shortName: 'Tanque',
    team: 'US',
    role: 'vehicle',
    hp: 400,
    armor: 3,
    damage: 44,
    fireRate: 0.5,
    range: 125,
    aimTime: 0.6,
    projectileSpeed: 300,
    spread: 1,
    splashRadius: 26,
    speed: 18,
    cost: 55,
    trainTime: 16.0,
    population: 8,
    // Un vehículo no se tambalea por un disparo de rifle.
    flinchDuration: 0,
    flinchCooldown: 999,
    corpseFade: 6.0,
    recoilPixels: 4,
    spriteHeight: 22,
    requiresBlueprint: true,
    hotkey: '4',
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
    cost: 5,
    trainTime: 3.2,
    population: 1,
    flinchDuration: 0.18,
    flinchCooldown: 0.9,
    corpseFade: 2.5,
    recoilPixels: 2,
    spriteHeight: 20,
  }),

  /**
   * Porteador vietnamita: el equivalente exacto del recolector estadounidense.
   *
   * Existe porque la IA ya no cobra una renta invisible. Para comprar un
   * guerrillero tiene que haber mandado antes a un porteador a un depósito, y
   * ese porteador se puede matar. Es la pieza que convierte al enemigo en una
   * economía rival en lugar de en un grifo de unidades.
   */
  vc_harvester: Object.freeze({
    id: 'vc_harvester',
    name: 'Porteador',
    team: 'VC',
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
    cost: 6,
    trainTime: 4.0,
    population: 1,
    flinchDuration: 0.25,
    flinchCooldown: 1.2,
    corpseFade: 2.5,
    recoilPixels: 0,
    spriteHeight: 20,
    harvest: Object.freeze({
      gatherTime: 0.7,
      carryCapacity: 3,
    }),
  }),

  /**
   * Tirador selecto vietnamita.
   *
   * Contrapartida del francotirador estadounidense: pega algo menos y tiene
   * algo menos de alcance, pero se mueve más y cuesta lo mismo. Le da a la IA
   * una herramienta real para castigar al jugador que avanza en línea recta.
   */
  vc_marksman: Object.freeze({
    id: 'vc_marksman',
    name: 'Tirador Selecto',
    team: 'VC',
    role: 'marksman',
    hp: 66,
    armor: 0,
    /** Mata a un soldado estadounidense (100 de vida) en dos disparos. */
    damage: 88,
    fireRate: 0.5,
    range: 142,
    aimTime: 0.85,
    projectileSpeed: 600,
    spread: 2,
    splashRadius: 0,
    speed: 30,
    cost: 10,
    trainTime: 5.5,
    population: 1,
    flinchDuration: 0.2,
    flinchCooldown: 1.0,
    corpseFade: 2.5,
    recoilPixels: 3,
    spriteHeight: 20,
    preferredRangeFactor: 0.92,
  }),

  /**
   * Tanque T-54.
   *
   * Antes tenía `cost: 0` y `trainTime: 0`, una bomba de relojería: en cuanto
   * entrara en la lista de compra de la IA habría podido generar tanques
   * gratis e infinitos. Ahora paga lo mismo que el jugador por la misma cola.
   */
  vc_tank: Object.freeze({
    id: 'vc_tank',
    name: 'Tanque T-54',
    team: 'VC',
    role: 'vehicle',
    hp: 400,
    armor: 3,
    damage: 42,
    fireRate: 0.5,
    range: 122,
    aimTime: 0.6,
    projectileSpeed: 300,
    spread: 1,
    splashRadius: 26,
    speed: 16,
    cost: 55,
    trainTime: 16.0,
    population: 8,
    flinchDuration: 0,
    flinchCooldown: 999,
    corpseFade: 6.0,
    recoilPixels: 4,
    spriteHeight: 22,
  }),
});

/**
 * ---------------------------------------------------------------------------
 * PODERES ACTIVABLES
 * ---------------------------------------------------------------------------
 *
 * Un poder no es una unidad: no ocupa población, no camina y nadie le puede
 * disparar. Es una compra puntual que convierte suministros en daño inmediato
 * sobre un punto que elige el jugador.
 *
 * Existe para tensar la decisión central del juego. Las bombas de racimo
 * cuestan 30 suministros: exactamente seis soldados. Un jugador que las gasta
 * mal se queda sin ejército; uno que las guarda demasiado pierde la ventana en
 * la que habrían roto el asalto enemigo. Eso es administrar recursos y actuar
 * a tiempo, que es el mensaje del juego.
 */
export const POWERS: Readonly<Record<string, PowerDef>> = Object.freeze({
  us_cluster_bomb: Object.freeze({
    id: 'us_cluster_bomb',
    name: 'Bombas de Racimo',
    shortName: 'Bombas',
    team: 'US',
    cost: 30,
    /**
     * Enfriamiento largo a propósito: si se pudieran encadenar, la respuesta
     * óptima sería ignorar el ejército y bombardear, y el juego dejaría de
     * tratar sobre gestionar tropas.
     */
    cooldown: 40,
    areaHalfWidth: 46,
    blastCount: 7,
    damagePerBlast: 55,
    blastRadius: 22,
    /**
     * Un segundo de retardo entre la orden y el primer impacto. Es lo que
     * convierte el poder en una decisión de anticipación en vez de un botón
     * de "matar lo que hay aquí": hay que predecir dónde estará el enemigo.
     */
    delay: 1.0,
    blastInterval: 0.13,
    hotkey: 'B',
  }),
});

/** Acceso seguro al catálogo de poderes. */
export function getPowerDef(id: string): PowerDef {
  const def = POWERS[id];
  if (!def) throw new Error(`Poder desconocido en el catálogo: "${id}"`);
  return def;
}

/**
 * ---------------------------------------------------------------------------
 * ESTRUCTURAS
 * ---------------------------------------------------------------------------
 *
 * El puesto de mando a 900 HP está calibrado así: dos soldados supervivientes
 * lo derriban en ~27 s, una escuadra de cinco en ~11 s. Suficiente para que la
 * orden ATACAR se sienta decisiva sin que el nivel se gane de un empujón.
 *
 * La base estadounidense aguanta más (1500) porque el jugador empieza sin
 * guarnición: es el contrapeso de los dos guerrilleros que ya están plantados
 * en la posición enemiga cuando arranca la partida.
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

/** Distancia de la base al depósito más cercano. Es la referencia económica. */
export const NEAREST_NODE_DISTANCE: number = WORLD.resourceOffsets[0] as number;

/**
 * Suministros por segundo que aporta un recolector que trabaja un depósito
 * situado a `distance` píxeles de su base.
 *
 * Se calcula en lugar de escribirse a mano para que la cifra que muestran la
 * interfaz y los tests no pueda desincronizarse del balance real — y ahora
 * además depende del depósito, que es justo lo que hace que agotar los
 * cercanos se note en la economía.
 */
export function harvesterIncomePerSecond(
  def: UnitDef,
  distance: number = NEAREST_NODE_DISTANCE,
): number {
  const h = def.harvest;
  if (!h || def.speed <= 0) return 0;
  const travel = (Math.abs(distance) / def.speed) * 2;
  const gathering = h.gatherTime * h.carryCapacity;
  return h.carryCapacity / (travel + gathering);
}
