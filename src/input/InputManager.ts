import type { Camera } from '../render/Camera.js';

/**
 * Control de cámara: arrastre con el puntero y desplazamiento con el teclado.
 *
 * El jugador necesita poder mirar el mapa por su cuenta (¿dónde está la línea
 * enemiga?, ¿me queda algún recolector vivo?) sin que la cámara automática se
 * lo impida. Tras soltar, el seguimiento se reanuda solo.
 */
export class InputManager {
  private dragging = false;
  private lastPointerX = 0;
  /** -1 izquierda, 1 derecha, 0 quieto. */
  private keyDirection = 0;

  /** Velocidad del desplazamiento con teclado, en píxeles por segundo. */
  private static readonly KEY_PAN_SPEED = 260;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    /** Ancho lógico del canvas, para convertir píxeles de pantalla a píxeles del juego. */
    private readonly logicalWidth: number,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastPointerX = e.clientX;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    // El canvas se muestra escalado: hay que convertir el desplazamiento de la
    // pantalla a píxeles lógicos, o el arrastre iría más rápido en monitores grandes.
    const scale = this.logicalWidth / this.canvas.getBoundingClientRect().width;
    const deltaX = (e.clientX - this.lastPointerX) * scale;
    this.lastPointerX = e.clientX;
    // Se arrastra el mundo, no la cámara: mover el dedo a la derecha revela
    // lo que hay a la izquierda, que es lo que espera cualquiera.
    this.camera.pan(-deltaX);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft') this.keyDirection = -1;
    else if (e.key === 'ArrowRight') this.keyDirection = 1;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (
      (e.key === 'ArrowLeft' && this.keyDirection === -1) ||
      (e.key === 'ArrowRight' && this.keyDirection === 1)
    ) {
      this.keyDirection = 0;
    }
  };

  update(dt: number): void {
    if (this.keyDirection !== 0) {
      this.camera.pan(this.keyDirection * InputManager.KEY_PAN_SPEED * dt);
    }
  }
}
