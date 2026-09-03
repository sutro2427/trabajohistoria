import { Rng } from '../core/Rng.js';
import { WORLD } from '../domain/balance/balance.js';
import type { PixelBuffer } from './PixelBuffer.js';
import { CLIPS, type AnimClip, type ClipName } from './AnimationCatalog.js';
import {
  US_HARVESTER_PALETTE,
  US_SNIPER_PALETTE,
  US_SOLDIER_PALETTE,
  VC_HARVESTER_PALETTE,
  VC_SOLDIER_PALETTE,
} from './palette.js';
import { drawSoldier, type SoldierSkin } from './recipes/SoldierRecipe.js';
import {
  drawTank,
  TANK_NEUTRAL,
  US_TANK_SKIN,
  VC_TANK_SKIN,
  type TankPose,
  type TankSkin,
} from './recipes/TankRecipe.js';
import {
  drawSupplyDrop,
  drawUsFirebase,
  drawVcBunker,
  drawVcOutpost,
} from './recipes/StructureRecipe.js';
import {
  drawBambooBarricade,
  drawBurntStump,
  drawBush,
  drawCrater,
  drawHelicopter,
  drawPalmTree,
  drawSandbagWall,
} from './recipes/PropRecipe.js';
import {
  drawDistantHills,
  drawForeground,
  drawGround,
  drawJungleCanopy,
  drawSky,
} from './recipes/BackgroundRecipe.js';

/**
 * ============================================================================
 * HORNEADO DE SPRITES
 * ============================================================================
 *
 * Recorre el catálogo de animaciones, ejecuta las recetas y produce todos los
 * fotogramas del juego como búferes de píxeles en memoria.
 *
 * Se ejecuta una sola vez al arrancar. Es TypeScript puro (sin DOM), así que
 * un test de Node puede hornear los mismos sprites y comparar su huella: si un
 * cambio en una receta altera el arte sin querer, el test lo detecta sin
 * necesidad de abrir un navegador.
 *
 * La semilla es fija por diseño: la aleatoriedad decorativa (suciedad, forma
 * de los árboles) debe ser *variada pero reproducible*.
 */

/** Semilla maestra del arte. Cambiarla regenera todo el aspecto del juego. */
export const ART_SEED = 20250903;

/**
 * Cajas visibles en un depósito lleno. Marca cuántas variantes de agotamiento
 * se hornean: `supply_drop_0` (vacío) hasta `supply_drop_3` (lleno).
 */
export const SUPPLY_DROP_STAGES = 3;

/** Fotogramas de un clip, en las dos orientaciones. */
export interface BakedClip {
  readonly clip: AnimClip;
  /** Fotogramas mirando a la derecha. */
  readonly right: readonly PixelBuffer[];
  /** Fotogramas mirando a la izquierda (ya reflejados: no se refleja en tiempo real). */
  readonly left: readonly PixelBuffer[];
}

/** Todos los clips de un tipo de unidad. */
export type BakedUnit = Readonly<Record<ClipName, BakedClip>>;

/** Resultado completo del horneado. */
export interface BakedArt {
  readonly units: Readonly<Record<string, BakedUnit>>;
  readonly structures: Readonly<Record<string, PixelBuffer>>;
  readonly props: Readonly<Record<string, PixelBuffer>>;
  readonly background: {
    readonly sky: PixelBuffer;
    readonly hills: PixelBuffer;
    readonly canopyFar: PixelBuffer;
    readonly canopyNear: PixelBuffer;
    readonly foreground: PixelBuffer;
    readonly ground: PixelBuffer;
  };
  /** Milisegundos que tardó el horneado; se muestra en el arranque en modo depuración. */
  readonly bakeMs: number;
}

/** Aspecto de cada unidad. Cambiar un skin genera otra unidad sin redibujar nada. */
const SKINS: Readonly<Record<string, SoldierSkin>> = Object.freeze({
  us_rifleman: {
    palette: US_SOLDIER_PALETTE,
    headgear: 'helmet',
    hasBackpack: true,
    hasWeapon: true,
    hasSack: false,
    dirtiness: 0.15,
    build: 0.8,
  },
  /**
   * El recolector es el mismo cuerpo con otro skin: uniforme desaturado,
   * gorro de selva blando en lugar de casco, sin arma, saco al hombro y
   * mucha suciedad. Se lee como "veterano agotado" sin dibujar un solo píxel nuevo.
   */
  us_harvester: {
    palette: US_HARVESTER_PALETTE,
    headgear: 'boonie',
    hasBackpack: false,
    hasWeapon: false,
    hasSack: true,
    dirtiness: 0.75,
    build: 0.3,
  },
  /**
   * Francotirador estadounidense: casco cambiado por gorro de selva —los
   * tiradores no llevan casco de acero, que estorba al apuntar—, complexión
   * más ligera y, sobre todo, el fusil largo con mira. Ese perfil es lo que
   * permite localizarlo dentro de una formación de un solo vistazo.
   */
  us_sniper: {
    palette: US_SNIPER_PALETTE,
    headgear: 'boonie',
    hasBackpack: false,
    hasWeapon: true,
    weapon: 'sniper',
    hasSack: false,
    dirtiness: 0.3,
    build: 0.35,
  },
  vc_guerrilla: {
    palette: VC_SOLDIER_PALETTE,
    headgear: 'conical',
    hasBackpack: false,
    hasWeapon: true,
    hasSack: false,
    dirtiness: 0.35,
    build: 0.2,
  },
  /**
   * Porteador vietnamita: el guerrillero con saco en lugar de fusil.
   * Conserva el sombrero cónico —es lo que identifica al bando de un vistazo—
   * y pierde el arma, que es lo que identifica al oficio.
   */
  /** Tirador selecto vietnamita: sombrero cónico y el mismo fusil largo. */
  vc_marksman: {
    palette: VC_SOLDIER_PALETTE,
    headgear: 'conical',
    hasBackpack: false,
    hasWeapon: true,
    weapon: 'sniper',
    hasSack: false,
    dirtiness: 0.4,
    build: 0.15,
  },
  vc_harvester: {
    palette: VC_HARVESTER_PALETTE,
    headgear: 'conical',
    hasBackpack: false,
    hasWeapon: false,
    hasSack: true,
    dirtiness: 0.7,
    build: 0.15,
  },
});

/** Clips que necesita cada rol. No se hornea lo que nunca se va a usar. */
const INFANTRY_CLIPS: readonly ClipName[] = ['idle', 'walk', 'aim', 'shoot', 'hit', 'die'];
const HARVESTER_CLIPS: readonly ClipName[] = ['idle', 'walk', 'harvest', 'carry', 'hit', 'die'];
const VEHICLE_CLIPS: readonly ClipName[] = ['idle', 'walk', 'aim', 'shoot', 'hit', 'die'];

function bakeUnit(skin: SoldierSkin, clipNames: readonly ClipName[], seed: number): BakedUnit {
  const result: Partial<Record<ClipName, BakedClip>> = {};

  for (const name of clipNames) {
    const clip = CLIPS[name];
    const right: PixelBuffer[] = [];
    for (let f = 0; f < clip.frames; f++) {
      // Semilla derivada de (unidad, clip, frame): la suciedad varía entre
      // fotogramas de forma estable, no parpadea al animar.
      const rng = new Rng(seed + name.length * 1013 + f * 7919);
      right.push(drawSoldier(clip.pose(f), skin, rng));
    }
    result[name] = {
      clip,
      right,
      // Se precalcula el reflejo: evita una transformación de canvas por frame.
      left: right.map((b) => b.mirrorX()),
    };
  }

  // Las unidades sin todos los clips reutilizan `idle` como respaldo, de modo
  // que pedir un clip inexistente nunca deja un hueco en pantalla.
  const fallback = result['idle'];
  if (!fallback) throw new Error('bakeUnit: falta el clip "idle", que es obligatorio');
  for (const name of Object.keys(CLIPS) as ClipName[]) {
    if (!result[name]) result[name] = fallback;
  }

  return result as BakedUnit;
}

/**
 * Hornea un vehículo.
 *
 * Los blindados reutilizan la misma estructura de clips que la infantería para
 * que el resto del juego (render, animación, atlas) no tenga que distinguirlos
 * — pero el contenido de cada clip es distinto, porque un tanque no camina ni
 * se agacha:
 *
 *   · `idle`  — parado, con un leve balanceo de suspensión.
 *   · `walk`  — cadenas rodando (cuatro fases de eslabones).
 *   · `shoot` — retroceso del cañón.
 *   · `die`   — el casco se hunde y queda como chatarra ardiendo.
 *
 * Que un vehículo y un soldado expongan la misma interfaz de clips es lo que
 * permite que el renderer los dibuje con el mismo código.
 */
function bakeVehicle(skin: TankSkin, seed: number): BakedUnit {
  const poseFor = (clip: ClipName, frame: number): TankPose => {
    switch (clip) {
      case 'walk':
        return { ...TANK_NEUTRAL, trackPhase: frame, bounce: frame % 2 === 0 ? 0 : -1 };
      case 'shoot':
        // Retroceso fuerte en el fotograma del disparo y recuperación gradual.
        return { ...TANK_NEUTRAL, recoil: [0, -4, -2, 0][frame] ?? 0 };
      case 'hit':
        return { ...TANK_NEUTRAL, bounce: 1 };
      case 'die':
        return { ...TANK_NEUTRAL, wreck: frame / 4, bounce: Math.min(2, frame) };
      case 'aim':
      case 'idle':
      default:
        return { ...TANK_NEUTRAL, bounce: frame % 2 === 0 ? 0 : -1 };
    }
  };

  const result: Partial<Record<ClipName, BakedClip>> = {};
  for (const name of VEHICLE_CLIPS) {
    const clip = CLIPS[name];
    const right: PixelBuffer[] = [];
    for (let f = 0; f < clip.frames; f++) {
      const rng = new Rng(seed + name.length * 1013 + f * 7919);
      right.push(drawTank(poseFor(name, f), skin, rng));
    }
    result[name] = { clip, right, left: right.map((b) => b.mirrorX()) };
  }

  const fallback = result['idle'];
  if (!fallback) throw new Error('bakeVehicle: falta el clip "idle"');
  for (const name of Object.keys(CLIPS) as ClipName[]) {
    if (!result[name]) result[name] = fallback;
  }
  return result as BakedUnit;
}

/** Hornea todo el arte del juego. Debe llamarse una única vez, al arrancar. */
export function bakeArt(seed: number = ART_SEED): BakedArt {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const units: Record<string, BakedUnit> = {
    us_rifleman: bakeUnit(SKINS['us_rifleman'] as SoldierSkin, INFANTRY_CLIPS, seed + 100),
    us_harvester: bakeUnit(SKINS['us_harvester'] as SoldierSkin, HARVESTER_CLIPS, seed + 200),
    vc_guerrilla: bakeUnit(SKINS['vc_guerrilla'] as SoldierSkin, INFANTRY_CLIPS, seed + 300),
    vc_harvester: bakeUnit(SKINS['vc_harvester'] as SoldierSkin, HARVESTER_CLIPS, seed + 350),
    us_sniper: bakeUnit(SKINS['us_sniper'] as SoldierSkin, INFANTRY_CLIPS, seed + 400),
    vc_marksman: bakeUnit(SKINS['vc_marksman'] as SoldierSkin, INFANTRY_CLIPS, seed + 450),
    // Los blindados no comparten el cuerpo humanoide: tienen su propia receta.
    us_tank: bakeVehicle(US_TANK_SKIN, seed + 500),
    vc_tank: bakeVehicle(VC_TANK_SKIN, seed + 550),
  };

  const structureRng = new Rng(seed + 400);
  const structures: Record<string, PixelBuffer> = {
    us_firebase: drawUsFirebase(structureRng),
    vc_outpost: drawVcOutpost(structureRng),
    vc_bunker: drawVcBunker(structureRng),
  };

  // Los cuatro estados de un depósito. Cada uno parte de un generador recién
  // sembrado con la misma semilla para que sean literalmente la misma pila de
  // cajas a la que le van faltando piezas, y no cuatro pilas distintas.
  for (let crates = 0; crates <= SUPPLY_DROP_STAGES; crates++) {
    structures[`supply_drop_${crates}`] = drawSupplyDrop(new Rng(seed + 450), crates);
  }

  const propRng = new Rng(seed + 500);
  const props: Record<string, PixelBuffer> = {
    sandbags: drawSandbagWall(propRng),
    bamboo: drawBambooBarricade(propRng),
    palm_a: drawPalmTree(propRng),
    palm_b: drawPalmTree(propRng),
    bush_a: drawBush(propRng),
    bush_b: drawBush(propRng),
    bush_c: drawBush(propRng),
    crater: drawCrater(propRng),
    stump: drawBurntStump(propRng),
    // Solo se usa en el menú principal.
    heli: drawHelicopter(),
  };

  // El cielo se hornea con la altura completa hasta la línea de suelo: si se
  // queda corto, por debajo no hay nada que dibujar y aparece una banda negra.
  const bgRng = new Rng(seed + 600);
  const background = {
    sky: drawSky(480, WORLD.groundY),
    hills: drawDistantHills(bgRng, 66),
    // Capas altas: la selva debe dominar el encuadre. Con capas bajas, el
    // cielo se comía media pantalla y el escenario no se leía como jungla.
    // Capas altas: en un teléfono en horizontal la acción ocupa una franja
    // estrecha, y un cielo que se come media pantalla la hace parecer aún más
    // pequeña. La selva sube para enmarcar el combate.
    canopyFar: drawJungleCanopy(bgRng, 138, 0.25),
    canopyNear: drawJungleCanopy(bgRng, 158, 0.7),
    foreground: drawForeground(bgRng, 52),
    ground: drawGround(bgRng, WORLD.logicalHeight - WORLD.groundY),
  };

  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return { units, structures, props, background, bakeMs: ended - started };
}
