import { clamp, damp } from '../core/math.js';
import { WORLD } from '../domain/balance/balance.js';

/**
 * Cámara lateral.
 *
 * Sigue el **centroide de la acción**: el punto medio entre la unidad aliada
 * más avanzada y la enemiga más avanzada. Ese encuadre es lo que hace que el
 * frente de batalla quede siempre en pantalla mientras la línea se desplaza,
 * en lugar de tener que perseguirla manualmente.
 */
export class Camera {
  /** Borde izquierdo del área visible, en coordenadas del mundo. */
  x = 0;

  /** Desplazamiento vertical de la sacudida por explosiones. */
  shakeY = 0;
  private shakeAmount = 0;

  /** Segundos que quedan de control manual antes de reanudar el seguimiento. */
  private manualTimer = 0;

  constructor(private readonly viewWidth: number = WORLD.logicalWidth) {}

  /** Máximo desplazamiento posible sin salir del mapa. */
  private get maxX(): number {
    return Math.max(0, WORLD.battlefieldWidth - this.viewWidth);
  }

  /** Coloca la cámara de golpe, sin suavizado (al iniciar un nivel). */
  snapTo(worldX: number): void {
    this.x = clamp(worldX - this.viewWidth * 0.5, 0, this.maxX);
  }

  /** Desplazamiento manual del jugador (arrastre o teclas). */
  pan(deltaX: number): void {
    this.x = clamp(this.x + deltaX, 0, this.maxX);
    // Tras soltar, la cámara espera un par de segundos antes de retomar el
    // seguimiento: si volviera de inmediato, mirar el mapa sería imposible.
    this.manualTimer = 2;
  }

  /**
   * Actualiza la posición.
   *
   * @param focusX Centro de interés calculado por el llamante.
   */
  update(dt: number, focusX: number): void {
    // La sacudida decae siempre, incluso durante el control manual.
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 26);
      // Alterna de signo cada frame: una vibración seca, no un balanceo.
      this.shakeY = (Math.random() - 0.5) * this.shakeAmount;
    } else {
      this.shakeY = 0;
    }

    if (this.manualTimer > 0) {
      this.manualTimer -= dt;
      return;
    }

    const target = clamp(focusX - this.viewWidth * 0.5, 0, this.maxX);

    // Zona muerta: por debajo de este umbral la cámara no se mueve. Evita el
    // temblor constante provocado por unidades que se empujan entre sí.
    if (Math.abs(target - this.x) < 8) return;

    this.x = damp(this.x, target, 3.5, dt);
  }

  /** Provoca una sacudida (disparo de tanque, estructura destruida). */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Convierte una coordenada del mundo en coordenada de pantalla. */
  toScreenX(worldX: number): number {
    return worldX - this.x;
  }

  /** `true` si algo situado en `worldX` con ese ancho puede verse. */
  isVisible(worldX: number, width: number): boolean {
    const screenX = worldX - this.x;
    return screenX + width > -8 && screenX - width < this.viewWidth + 8;
  }
}
