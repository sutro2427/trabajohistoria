import { clamp } from './math.js';

/**
 * Bucle de juego con paso fijo y render interpolado.
 *
 * Dos ideas que justifican toda la clase:
 *
 * 1. **Paso fijo.** La simulación avanza siempre en incrementos de 1/60 s,
 *    independientemente de los FPS reales. Sin esto, un equipo lento y uno
 *    rápido producirían partidas distintas y los tests no serían reproducibles.
 *
 * 2. **Interpolación.** Como la simulación va a 60 Hz pero la pantalla puede ir
 *    a 144 Hz, el render recibe `alpha` ∈ [0,1) para dibujar entre el estado
 *    anterior y el actual. Sin esto el movimiento se ve a tirones.
 */
export interface LoopCallbacks {
  /** Avanza la simulación. `dt` es SIEMPRE el paso fijo. */
  fixedUpdate(dt: number): void;
  /** Dibuja el frame. `alpha` interpola entre el estado previo y el actual. */
  render(alpha: number): void;
}

export interface GameLoopOptions {
  /** Frecuencia de la simulación en Hz. Por defecto 60. */
  stepHz?: number;
  /**
   * Máximo de pasos de simulación por frame. Evita la "espiral de la muerte":
   * si la pestaña estuvo oculta 30 s, sin este tope el bucle intentaría
   * ejecutar 1800 pasos de golpe y el navegador se congelaría.
   */
  maxStepsPerFrame?: number;
}

export class GameLoop {
  private readonly step: number;
  private readonly maxSteps: number;
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  private timeScale = 1;

  /** Frames por segundo medidos, suavizados. Solo informativo. */
  private smoothedFps = 60;

  constructor(
    private readonly callbacks: LoopCallbacks,
    options: GameLoopOptions = {},
  ) {
    this.step = 1 / (options.stepHz ?? 60);
    this.maxSteps = options.maxStepsPerFrame ?? 5;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  /**
   * Multiplicador de velocidad de la simulación.
   *
   * Con `setTimeScale(8)` una partida de ocho minutos transcurre en uno: es lo
   * que permite que los tests end-to-end jueguen niveles completos en segundos.
   */
  setTimeScale(scale: number): void {
    this.timeScale = clamp(scale, 0, 32);
  }

  getTimeScale(): number {
    return this.timeScale;
  }

  getFps(): number {
    return this.smoothedFps;
  }

  /**
   * Al volver de una pestaña oculta, `performance.now()` ha saltado varios
   * segundos. Reiniciamos la referencia temporal para no acumular ese salto.
   */
  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) {
      this.lastTime = performance.now();
      this.accumulator = 0;
    }
  };

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    // Se acota el frame a 250 ms: un pico puntual no debe deformar la simulación.
    const frameTime = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    if (frameTime > 0) {
      this.smoothedFps += (1 / frameTime - this.smoothedFps) * 0.05;
    }

    this.accumulator += frameTime * this.timeScale;

    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSteps) {
      this.callbacks.fixedUpdate(this.step);
      this.accumulator -= this.step;
      steps++;
    }

    // Si se agotó el presupuesto de pasos, se descarta el tiempo sobrante en
    // lugar de arrastrarlo al siguiente frame (que volvería a saturarse).
    if (steps === this.maxSteps) this.accumulator = 0;

    this.callbacks.render(this.accumulator / this.step);
  };
}
