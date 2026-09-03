import { hex, type Rgba } from './PixelBuffer.js';

/**
 * Paleta militar de los años 60-70.
 *
 * Una paleta cerrada y compartida por todo el juego es lo que hace que las
 * unidades, las estructuras y la selva parezcan pertenecer al mismo mundo.
 * Los mismos valores están replicados en `ui/ui.css` para que la interfaz
 * combine con el campo de batalla.
 */
export const PALETTE = Object.freeze({
  // --- Verdes de uniforme y vegetación ---
  oliveDark: hex('#2e3b1b'),
  olive: hex('#4a5d23'),
  oliveLight: hex('#6b7f3a'),

  // --- Tierras y lonas ---
  khaki: hex('#a8955e'),
  sand: hex('#c9b584'),
  brownDark: hex('#3a2a18'),
  brown: hex('#6b4a2a'),
  brownLight: hex('#8a6238'),
  mud: hex('#4a3826'),

  // --- Pieles ---
  skinUs: hex('#c79a6b'),
  skinUsShade: hex('#9c7550'),
  skinVc: hex('#b0834f'),
  skinVcShade: hex('#8a6339'),

  // --- Metales ---
  steel: hex('#4c4c4c'),
  steelLight: hex('#7a7a7a'),
  steelDark: hex('#2b2b2b'),
  gunmetal: hex('#33352e'),

  // --- Contorno: el color que da forma a todo ---
  outline: hex('#14140f'),

  // --- Selva y atmósfera ---
  jungleDeep: hex('#14251a'),
  jungleMid: hex('#1e3a24'),
  jungleLight: hex('#355a31'),
  jungleHighlight: hex('#4b7340'),
  fog: hex('#8fa88c'),
  skyHaze: hex('#c8cba8'),
  skyWarm: hex('#d9c9a0'),
  skyHigh: hex('#a8b596'),

  // --- Efectos ---
  muzzle: hex('#ffd98a'),
  muzzleHot: hex('#fff4d0'),
  blood: hex('#8f2020'),
  bloodDark: hex('#5c1414'),
  smoke: hex('#6e6e63'),
  tracer: hex('#ffe9a8'),

  // --- Bandos: color de acento para distinguirlos de un vistazo ---
  usAccent: hex('#3f5f8a'),
  vcAccent: hex('#8f3030'),
} as const);

export type PaletteKey = keyof typeof PALETTE;

/** Aspecto cromático de un soldado. Cambiarlo genera otra unidad sin redibujar. */
export interface SoldierPalette {
  readonly uniform: Rgba;
  readonly uniformShade: Rgba;
  readonly skin: Rgba;
  readonly skinShade: Rgba;
  readonly gear: Rgba;
  readonly weapon: Rgba;
  readonly accent: Rgba;
}

/** Soldado estadounidense: verde oliva, casco M1, chaleco. */
export const US_SOLDIER_PALETTE: SoldierPalette = Object.freeze({
  uniform: PALETTE.olive,
  uniformShade: PALETTE.oliveDark,
  skin: PALETTE.skinUs,
  skinShade: PALETTE.skinUsShade,
  gear: PALETTE.khaki,
  weapon: PALETTE.gunmetal,
  accent: PALETTE.usAccent,
});

/**
 * Recolector: el mismo cuerpo, pero un uniforme desgastado y sucio.
 * La desaturación y el `speckle` de barro hacen el resto (ver SoldierRecipe).
 */
export const US_HARVESTER_PALETTE: SoldierPalette = Object.freeze({
  uniform: hex('#4f5540'),
  uniformShade: hex('#33372a'),
  skin: hex('#b08a63'),
  skinShade: hex('#8a6a49'),
  gear: hex('#8a7c52'),
  weapon: PALETTE.brown,
  accent: PALETTE.mud,
});

/** Guerrillero vietnamita: ropa oscura, sombrero cónico, más delgado. */
export const VC_SOLDIER_PALETTE: SoldierPalette = Object.freeze({
  uniform: hex('#3d4438'),
  uniformShade: hex('#262b22'),
  skin: PALETTE.skinVc,
  skinShade: PALETTE.skinVcShade,
  gear: hex('#7d6c40'),
  weapon: PALETTE.gunmetal,
  accent: PALETTE.vcAccent,
});
