import { clamp } from '../core/math.js';
import { WORLD } from '../domain/balance/balance.js';

/**
 * ============================================================================
 * VIEWPORT ADAPTATIVO
 * ============================================================================
 *
 * El juego se dibujaba siempre en 480×270 (16:9). En un monitor va bien, pero
 * un teléfono actual en horizontal tiene una pantalla mucho más alargada —20:9
 * es lo habitual— y encajar un 16:9 dentro dejaba **barras negras enormes a
 * los lados**: en un dispositivo de prueba, el juego ocupaba el 77 % del ancho
 * disponible y el resto era marco.
 *
 * La solución no es estirar la imagen (deformaría el pixel art) ni recortarla
 * (escondería la interfaz). Es **mantener la altura lógica y ampliar el
 * ancho** hasta cubrir la pantalla: como el campo de batalla se desplaza en
 * horizontal, un teléfono alargado simplemente ve más terreno de una vez. Los
 * píxeles siguen siendo cuadrados y nada se deforma.
 *
 * La altura se mantiene fija a propósito: la línea de suelo, la altura de las
 * unidades y las capas de selva están calibradas sobre ella, y cambiarla
 * obligaría a recalcular todo el escenario.
 */

/** Altura lógica, invariable: todo el arte está calibrado sobre ella. */
export const LOGICAL_HEIGHT = WORLD.logicalHeight;

/**
 * Límites del ancho lógico.
 *
 * El mínimo evita que en una ventana muy estrecha se vea tan poco campo que no
 * quepa la acción. El máximo evita que en una pantalla ultrapanorámica se vea
 * medio mapa de golpe, lo que quitaría toda la tensión de avanzar.
 */
const MIN_WIDTH = 420;
/** El máximo vive en el catálogo de balance: el horneado del cielo lo comparte. */
const MAX_WIDTH = WORLD.maxLogicalWidth;

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/** Calcula el área lógica que mejor cubre un espacio disponible. */
export function computeViewport(availableWidth: number, availableHeight: number): ViewportSize {
  if (availableHeight <= 0 || availableWidth <= 0) {
    return { width: WORLD.logicalWidth, height: LOGICAL_HEIGHT };
  }

  const aspect = availableWidth / availableHeight;
  // El ancho se redondea a par: con anchos impares, el centrado de sprites
  // cae en medio píxel y el pixel art tiembla al desplazar la cámara.
  const ideal = Math.round((LOGICAL_HEIGHT * aspect) / 2) * 2;

  return { width: clamp(ideal, MIN_WIDTH, MAX_WIDTH), height: LOGICAL_HEIGHT };
}

/**
 * Mantiene el canvas ajustado al tamaño de la ventana.
 *
 * Escucha los cambios de tamaño y de orientación, y avisa cuando el área
 * lógica cambia para que la cámara y la interfaz se recalculen. En un móvil
 * esto se dispara al girar el aparato y al entrar o salir de pantalla
 * completa, que son justo los momentos en los que el encuadre se rompía.
 */
export class ViewportManager {
  private current: ViewportSize;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onResize: (size: ViewportSize) => void,
  ) {
    this.current = computeViewport(window.innerWidth, window.innerHeight);
    this.apply();

    window.addEventListener('resize', this.handle);
    window.addEventListener('orientationchange', this.handle);
    // `visualViewport` es el único que reporta bien el área útil cuando
    // aparece o se retrae la barra de direcciones del navegador móvil.
    window.visualViewport?.addEventListener('resize', this.handle);
  }

  get size(): ViewportSize {
    return this.current;
  }

  private readonly handle = (): void => {
    const vv = window.visualViewport;
    const width = vv?.width ?? window.innerWidth;
    const height = vv?.height ?? window.innerHeight;
    const next = computeViewport(width, height);

    if (next.width === this.current.width && next.height === this.current.height) return;

    this.current = next;
    this.apply();
    this.onResize(next);
  };

  private apply(): void {
    this.canvas.width = this.current.width;
    this.canvas.height = this.current.height;
    // El contexto pierde su configuración al redimensionar el canvas: sin
    // esto, el pixel art sale borroso tras girar el teléfono.
    const ctx = this.canvas.getContext('2d');
    if (ctx) ctx.imageSmoothingEnabled = false;
    // La relación de aspecto se publica al CSS para que el marco la siga.
    //
    // Se escribe en la raíz del documento y no en el canvas: las variables CSS
    // heredan hacia abajo, y quien la consume es `#stage`, que es el PADRE del
    // canvas. Publicada en el canvas no llegaba a nadie y el escenario se
    // quedaba con el 16:9 por defecto.
    document.documentElement.style.setProperty(
      '--stage-aspect',
      `${this.current.width} / ${this.current.height}`,
    );
  }

  dispose(): void {
    window.removeEventListener('resize', this.handle);
    window.removeEventListener('orientationchange', this.handle);
    window.visualViewport?.removeEventListener('resize', this.handle);
  }
}
