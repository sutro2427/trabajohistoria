import { PixelBuffer, mix, shade, type Rgba } from '../PixelBuffer.js';
import { PALETTE } from '../palette.js';
import type { Rng } from '../../core/Rng.js';

/**
 * ============================================================================
 * SELVA VIETNAMITA — generación procedural del escenario
 * ============================================================================
 *
 * El fondo se construye como una pila de tiras horizontales repetibles que se
 * desplazan a distinta velocidad (parallax). Cuanto más lejos está una capa,
 * más lento se mueve y más se lava su color hacia la niebla: son los dos
 * trucos que crean profundidad en una imagen plana.
 *
 * Todas las tiras se generan con un `Rng` sembrado, así que la selva es
 * siempre la misma partida tras partida — y los tests pueden compararla.
 */

/** Ancho de cada tira. Se repite en bucle para cubrir el mundo entero. */
export const STRIP_W = 480;

/** Una capa del fondo con su factor de parallax. */
export interface BackgroundLayer {
  readonly buffer: PixelBuffer;
  /** 0 = fija con la cámara; 1 = se mueve con el mundo; >1 = primer plano. */
  readonly parallax: number;
  /** Posición vertical donde se dibuja la tira. */
  readonly y: number;
}

/**
 * Cielo tropical: bandas escalonadas de color.
 *
 * Un degradado suave sería lo natural en gráficos modernos, pero rompería la
 * estética: en pixel art el cielo se hace por bandas de color plano, y ese
 * escalonado es parte del lenguaje visual.
 */
export function drawSky(width: number, height: number): PixelBuffer {
  const buf = new PixelBuffer(width, height);
  const bands = 7;
  for (let b = 0; b < bands; b++) {
    const t = b / (bands - 1);
    const color = mix(PALETTE.skyHigh, PALETTE.skyWarm, t);
    const y0 = Math.floor((b / bands) * height);
    const y1 = Math.floor(((b + 1) / bands) * height);
    buf.rect(0, y0, width, y1 - y0, color);
  }
  // Sol velado por la humedad.
  //
  // Se dibuja de fuera hacia dentro y en opaco, no con capas semitransparentes
  // superpuestas: al mezclar alfas sobre alfas el centro salía más oscuro que
  // el halo y el sol parecía una rosquilla.
  const sunX = Math.floor(width * 0.74);
  const sunY = Math.floor(height * 0.22);
  const haloOuter = mix(PALETTE.skyWarm, PALETTE.sand, 0.35);
  const haloInner = mix(PALETTE.sand, PALETTE.muzzleHot, 0.45);
  buf.ellipse(sunX, sunY, 15, 11, haloOuter);
  buf.ellipse(sunX, sunY, 9, 7, haloInner);
  buf.ellipse(sunX, sunY, 5, 4, PALETTE.muzzleHot);

  // Bancos de nubes bajas y aplanadas: rompen el vacío del cielo y refuerzan
  // la sensación de aire húmedo. Se dibujan con posiciones fijas —no
  // aleatorias— porque el cielo se hornea una sola vez y debe quedar compuesto.
  const cloudTone = mix(PALETTE.skyHaze, PALETTE.sand, 0.4);
  const clouds: readonly [number, number, number][] = [
    [0.12, 0.3, 1.0],
    [0.34, 0.18, 0.7],
    [0.55, 0.36, 1.2],
    [0.86, 0.24, 0.85],
  ];
  for (const [fx, fy, scale] of clouds) {
    const cx = Math.floor(width * fx);
    const cy = Math.floor(height * fy);
    buf.ellipse(cx, cy, 22 * scale, 3.5 * scale, cloudTone);
    buf.ellipse(cx - 9 * scale, cy + 1, 13 * scale, 2.5 * scale, cloudTone);
    buf.ellipse(cx + 11 * scale, cy + 1, 15 * scale, 2.8 * scale, cloudTone);
    // Base algo más oscura: da volumen sin romper el estilo de bandas planas.
    buf.hLine(cx - 20 * scale, cx + 20 * scale, cy + Math.round(3 * scale), mix(cloudTone, PALETTE.fog, 0.4));
  }
  return buf;
}

/**
 * Colinas lejanas en silueta, lavadas hacia la niebla.
 *
 * Se generan con una suma de senos de distinta frecuencia: da un perfil
 * orgánico y continuo, y como la tira es cíclica los extremos casan al
 * repetirse (sin costura visible).
 */
export function drawDistantHills(rng: Rng, height: number): PixelBuffer {
  const buf = new PixelBuffer(STRIP_W, height);
  const base = height - 2;

  // Fases aleatorias pero frecuencias enteras: garantiza que la tira es cíclica.
  const phase1 = rng.range(0, Math.PI * 2);
  const phase2 = rng.range(0, Math.PI * 2);
  const phase3 = rng.range(0, Math.PI * 2);

  const ridge = (x: number): number => {
    const t = (x / STRIP_W) * Math.PI * 2;
    return (
      Math.sin(t * 1 + phase1) * 9 +
      Math.sin(t * 3 + phase2) * 4 +
      Math.sin(t * 7 + phase3) * 2
    );
  };

  // Cresta trasera, casi disuelta en la niebla.
  const farColor = mix(PALETTE.fog, PALETTE.jungleMid, 0.28);
  for (let x = 0; x < STRIP_W; x++) {
    const top = Math.round(base - 13 - ridge(x) * 0.6);
    buf.vLine(x, top, height - 1, farColor);
  }

  // Cresta delantera, algo más definida y más verde.
  const nearColor = mix(PALETTE.fog, PALETTE.jungleMid, 0.55);
  for (let x = 0; x < STRIP_W; x++) {
    const top = Math.round(base - 6 - ridge(x + 120));
    buf.vLine(x, top, height - 1, nearColor);
    buf.set(x, top, mix(nearColor, PALETTE.fog, 0.45));
  }

  // Jirones de neblina atrapados entre las laderas.
  for (let i = 0; i < 7; i++) {
    const x = rng.int(0, STRIP_W - 1);
    const y = base - rng.int(2, 12);
    const w = rng.int(14, 40);
    buf.hLine(x, x + w, y, { ...PALETTE.fog, a: 70 });
  }
  return buf;
}

/**
 * Dosel de selva: la masa de árboles que define el escenario.
 *
 * Cada árbol es un tronco más copas elípticas apiladas con desplazamientos
 * aleatorios. La variación de altura, anchura y tono es lo que evita que
 * parezca un patrón repetido.
 *
 * @param depth 0 = lejano y lavado por la niebla, 1 = cercano y saturado.
 */
export function drawJungleCanopy(rng: Rng, height: number, depth: number): PixelBuffer {
  const buf = new PixelBuffer(STRIP_W, height);
  const groundY = height - 1;

  // A más lejanía, más niebla mezclada y menos contraste.
  const fogAmount = (1 - depth) * 0.55;
  const leafBase = mix(PALETTE.jungleMid, PALETTE.fog, fogAmount);
  const leafLight = mix(PALETTE.jungleLight, PALETTE.fog, fogAmount);
  const leafDark = mix(PALETTE.jungleDeep, PALETTE.fog, fogAmount * 0.7);
  const trunkColor = mix(PALETTE.brownDark, PALETTE.fog, fogAmount);

  const spacing = Math.round(16 + (1 - depth) * 8);
  for (let x = -8; x < STRIP_W + 8; x += spacing + rng.int(-3, 5)) {
    // Troncos cortos y anchos. Con troncos largos y de un píxel, la capa se
    // leía como una valla de postes en lugar de como una masa de selva.
    const trunkH = Math.round(height * (0.22 + rng.next() * 0.22));
    const trunkTop = groundY - trunkH;
    const trunkW = depth > 0.5 ? 3 : 2;

    // Tronco con una leve curvatura: los árboles rectos parecen postes.
    const bend = rng.range(-2, 2);
    for (let y = trunkTop; y <= groundY; y++) {
      const t = (groundY - y) / Math.max(1, trunkH);
      const bx = Math.round(x + bend * t * t);
      buf.rect(bx, y, trunkW, 1, trunkColor);
    }

    // Copa: dos o tres masas elípticas superpuestas.
    const crownX = Math.round(x + bend);
    const crowns = rng.int(2, 3);
    for (let c = 0; c < crowns; c++) {
      const cx = crownX + rng.int(-5, 5);
      const cy = trunkTop + rng.int(-3, 4);
      const rx = rng.range(6, 12) * (0.7 + depth * 0.4);
      const ry = rng.range(3, 6) * (0.7 + depth * 0.4);
      buf.ellipse(cx, cy, rx, ry, c === 0 ? leafBase : leafDark);
      // Luz por arriba: sugiere el sol filtrándose por el dosel.
      buf.ellipse(cx - 1, cy - 1, rx * 0.6, ry * 0.55, leafLight);
    }
  }

  // Zócalo de maleza: una banda opaca que cierra la parte baja de la capa.
  //
  // Es imprescindible que sea opaca de lado a lado. Si quedan huecos, por
  // ellos se ve el vacío que hay detrás de la capa y aparecen bandas negras
  // entre el dosel y el suelo.
  const skirtHeight = Math.round(height * 0.34);
  const skirtTop = groundY - skirtHeight;
  buf.rect(0, skirtTop, STRIP_W, skirtHeight + 1, leafDark);

  // Borde superior irregular, para que el zócalo no se lea como un rectángulo.
  for (let x = 0; x < STRIP_W; x++) {
    const wobble =
      Math.sin(x * 0.21) * 3 + Math.sin(x * 0.07) * 4 + Math.sin(x * 0.53) * 1.5;
    const top = Math.round(skirtTop - wobble);
    buf.vLine(x, top, skirtTop, leafBase);
    buf.set(x, top, leafLight);
  }

  // Interior del zócalo: sin esto es una plancha de color plano que ocupa una
  // quinta parte de la pantalla. Troncos en penumbra y matas de sotobosque le
  // dan profundidad y lo convierten en espesura.
  const trunkShadow = mix(trunkColor, leafDark, 0.55);
  for (let x = rng.int(4, 20); x < STRIP_W; x += rng.int(11, 26)) {
    const top = skirtTop + rng.int(0, 4);
    const bottom = groundY - rng.int(0, 5);
    buf.rect(x, top, rng.int(1, 3), bottom - top, trunkShadow);
  }
  for (let i = 0; i < 46; i++) {
    const cx = rng.int(0, STRIP_W - 1);
    const cy = skirtTop + rng.int(2, skirtHeight);
    const tone = rng.chance(0.55) ? mix(leafBase, leafDark, 0.45) : mix(leafDark, leafLight, 0.3);
    buf.ellipse(cx, cy, rng.range(2.5, 6), rng.range(1.5, 3), tone);
  }
  // La luz se apaga hacia el suelo del bosque.
  buf.shadeRows(skirtTop, 1.06, 0.78);
  return buf;
}

/**
 * Follaje de primer plano: se dibuja DELANTE de las unidades y se mueve más
 * rápido que el mundo. Es lo que hace que el jugador sienta que la cámara está
 * dentro de la selva y no mirándola desde fuera.
 *
 * Se deja transparente en la mayor parte para no tapar la acción.
 */
export function drawForeground(rng: Rng, height: number): PixelBuffer {
  const buf = new PixelBuffer(STRIP_W, height);
  const groundY = height - 1;

  // Matas de helecho separadas: nunca una banda continua que oculte el combate.
  for (let cluster = 0; cluster < 7; cluster++) {
    const cx = rng.int(0, STRIP_W - 1);
    const scale = rng.range(0.8, 1.4);
    const fronds = rng.int(4, 7);
    for (let f = 0; f < fronds; f++) {
      const angle = -Math.PI / 2 + rng.range(-1.1, 1.1);
      const len = rng.range(9, 18) * scale;
      const tone = rng.chance(0.5) ? PALETTE.jungleDeep : shade(PALETTE.jungleMid, 0.75);
      // Cada fronda es una línea curvada con foliolos a los lados.
      let px = cx + rng.int(-3, 3);
      let py = groundY;
      for (let s = 0; s < len; s++) {
        px += Math.cos(angle) * 1 + s * 0.035;
        py += Math.sin(angle) * 1 + s * 0.05;
        buf.set(Math.round(px), Math.round(py), tone);
        if (s % 3 === 0 && s > 2) {
          buf.set(Math.round(px) - 1, Math.round(py) + 1, tone);
          buf.set(Math.round(px) + 1, Math.round(py) + 1, tone);
        }
      }
    }
  }
  return buf;
}

/**
 * Suelo del campo de batalla: tierra roja vietnamita con hierba y roderas.
 * Es la capa sobre la que caminan las unidades, así que se mantiene legible
 * y de bajo contraste para que los sprites destaquen.
 */
export function drawGround(rng: Rng, height: number): PixelBuffer {
  const buf = new PixelBuffer(STRIP_W, height);
  const dirt: Rgba = mix(PALETTE.mud, PALETTE.brown, 0.35);

  buf.rect(0, 0, STRIP_W, height, dirt);
  // Franja de hierba que remata el borde superior del suelo.
  buf.hLine(0, STRIP_W - 1, 0, PALETTE.jungleLight);
  buf.hLine(0, STRIP_W - 1, 1, shade(PALETTE.jungleMid, 1.1));

  // Matojos de hierba dispersos sobre la línea del suelo.
  for (let i = 0; i < 130; i++) {
    const x = rng.int(0, STRIP_W - 1);
    const h = rng.int(1, 3);
    buf.vLine(x, 2 - h, 2, rng.chance(0.5) ? PALETTE.jungleLight : PALETTE.jungleMid);
  }

  // Manchas de hierba alta repartidas por el terreno.
  //
  // Sin ellas la franja de suelo queda como un bloque marrón liso que ocupa
  // un cuarto de la pantalla y no aporta nada: estas matas le dan textura y
  // dan sensación de que las tropas avanzan sobre terreno vivo.
  for (let i = 0; i < 26; i++) {
    const cx = rng.int(0, STRIP_W - 1);
    const cy = rng.int(4, height - 4);
    const blades = rng.int(4, 9);
    const tone = rng.chance(0.5) ? shade(PALETTE.jungleMid, 0.8) : shade(PALETTE.jungleDeep, 1.2);
    for (let b = 0; b < blades; b++) {
      const bx = cx + rng.int(-4, 4);
      const bh = rng.int(2, 4);
      buf.vLine(bx, cy - bh, cy, tone);
      // Punta doblada: una brizna recta parece un palo.
      buf.set(bx + (rng.chance(0.5) ? 1 : -1), cy - bh, tone);
    }
  }

  // Piedras, guijarros y roderas: ruido de baja frecuencia que evita la
  // sensación de suelo plano y perfectamente uniforme.
  for (let i = 0; i < 90; i++) {
    const x = rng.int(0, STRIP_W - 1);
    const y = rng.int(3, height - 1);
    const tone = rng.chance(0.5) ? shade(dirt, 0.82) : shade(dirt, 1.15);
    buf.set(x, y, tone);
    if (rng.chance(0.3)) buf.set(x + 1, y, tone);
  }
  for (let i = 0; i < 8; i++) {
    const x = rng.int(0, STRIP_W - 20);
    const y = rng.int(4, height - 2);
    buf.hLine(x, x + rng.int(8, 20), y, shade(dirt, 0.86));
  }

  // El suelo se oscurece hacia abajo: da la sensación de sombra bajo el frente.
  buf.shadeRows(Math.floor(height * 0.4), 1.0, 0.78);
  return buf;
}
