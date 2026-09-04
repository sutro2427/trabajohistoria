import { Camera } from '../render/Camera.js';

/**
 * ============================================================================
 * CONTROL DE CÁMARA
 * ============================================================================
 *
 * Arrastrar para mirar el mapa, pellizcar para acercar, y las flechas del
 * teclado para lo mismo en un ordenador.
 *
 * El jugador necesita poder mirar por su cuenta —¿dónde está la línea enemiga?,
 * ¿me queda algún recolector vivo?— sin que la cámara automática se lo impida.
 * Tras soltar, el seguimiento se reanuda solo.
 *
 * **Sobre el pellizco.** Los punteros se llevan en un mapa en lugar de
 * guardar solo el primero, porque un dedo puede levantarse antes que el otro y
 * el navegador no garantiza el orden. Mientras hay dos dedos NO se arrastra: un
 * pellizco mueve los dos puntos y sin esta condición la cámara se iría de viaje
 * a la vez que se acerca.
 */
export class InputManager {
  /** Punteros activos sobre el lienzo, por identificador. */
  private readonly pointers = new Map<number, number>();

  private dragging = false;
  private lastPointerX = 0;

  /** Separación entre los dos dedos al empezar el pellizco, en píxeles. */
  private pinchStartDistance = 0;
  /** Aumento que había al empezar el pellizco. */
  private pinchStartZoom = 1;

  /** -1 izquierda, 1 derecha, 0 quieto. */
  private keyDirection = 0;

  /** Velocidad del desplazamiento con teclado, en píxeles por segundo. */
  private static readonly KEY_PAN_SPEED = 260;

  /** Salto de aumento de los botones y de la rueda del ratón. */
  private static readonly ZOOM_STEP = 0.25;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    /** Ancho lógico del canvas, para convertir píxeles de pantalla a píxeles del juego. */
    private logicalWidth: number,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    // `passive: false` es imprescindible: sin poder cancelar el evento, la
    // rueda con Ctrl haría el zoom del NAVEGADOR sobre toda la página.
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  // -------------------------------------------------------------------------
  // Puntero
  // -------------------------------------------------------------------------

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pointers.set(e.pointerId, e.clientX);
    this.canvas.setPointerCapture(e.pointerId);

    if (this.pointers.size === 2) {
      // Empieza un pellizco: se abandona el arrastre en curso y se toma la
      // separación de referencia.
      this.dragging = false;
      this.pinchStartDistance = this.pointerSpread();
      this.pinchStartZoom = this.camera.zoom;
      return;
    }

    this.dragging = true;
    this.lastPointerX = e.clientX;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, e.clientX);

    if (this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }

    if (!this.dragging) return;

    // El canvas se muestra escalado y además puede estar aumentado: hay que
    // convertir el desplazamiento de la pantalla a píxeles del MUNDO, o el
    // arrastre iría más rápido en monitores grandes y más lento al acercar.
    const deltaX = (e.clientX - this.lastPointerX) * this.screenToWorld();
    this.lastPointerX = e.clientX;
    // Se arrastra el mundo, no la cámara: mover el dedo a la derecha revela
    // lo que hay a la izquierda, que es lo que espera cualquiera.
    this.camera.pan(-deltaX);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }

    // Al levantar un dedo de un pellizco, el que queda continúa arrastrando
    // desde donde está. Sin esto, la cámara pegaría un salto.
    if (this.pointers.size === 1) {
      const [remaining] = [...this.pointers.values()];
      this.lastPointerX = remaining ?? 0;
      this.dragging = true;
      return;
    }

    if (this.pointers.size === 0) this.dragging = false;
  };

  /** Separación actual entre los dos primeros dedos, en píxeles de pantalla. */
  private pointerSpread(): number {
    const xs = [...this.pointers.values()];
    const a = xs[0] ?? 0;
    const b = xs[1] ?? 0;
    return Math.abs(a - b);
  }

  private updatePinch(): void {
    // Por debajo de unos pocos píxeles la razón se dispara y el aumento salta.
    if (this.pinchStartDistance < 12) return;
    const ratio = this.pointerSpread() / this.pinchStartDistance;
    this.camera.setZoom(this.pinchStartZoom * ratio);
  }

  /** Píxeles de mundo por cada píxel de pantalla. */
  private screenToWorld(): number {
    const cssWidth = this.canvas.getBoundingClientRect().width || this.logicalWidth;
    return this.logicalWidth / cssWidth / this.camera.zoom;
  }

  // -------------------------------------------------------------------------
  // Teclado y rueda
  // -------------------------------------------------------------------------

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft') this.keyDirection = -1;
    else if (e.key === 'ArrowRight') this.keyDirection = 1;
    else if (e.key === '+' || e.key === '=') this.zoomBy(InputManager.ZOOM_STEP);
    else if (e.key === '-') this.zoomBy(-InputManager.ZOOM_STEP);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (
      (e.key === 'ArrowLeft' && this.keyDirection === -1) ||
      (e.key === 'ArrowRight' && this.keyDirection === 1)
    ) {
      this.keyDirection = 0;
    }
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? InputManager.ZOOM_STEP : -InputManager.ZOOM_STEP);
  };

  /** Cambia el aumento en pasos. Lo usan los botones, la rueda y el teclado. */
  zoomBy(delta: number): void {
    this.camera.setZoom(this.camera.zoom + delta);
  }

  /** Devuelve la vista a su tamaño normal. */
  resetZoom(): void {
    this.camera.setZoom(1);
  }

  /** Ajusta el ancho lógico tras un cambio de tamaño o de orientación. */
  setLogicalWidth(width: number): void {
    this.logicalWidth = width;
  }

  update(dt: number): void {
    if (this.keyDirection !== 0) {
      this.camera.pan(this.keyDirection * InputManager.KEY_PAN_SPEED * dt);
    }
  }
}
