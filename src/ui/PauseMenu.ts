import { formatTime } from '../core/math.js';
import type { LevelDef } from '../domain/balance/types.js';
import { fullscreenSupported, toggleFullscreen } from './fullscreen.js';
import { requireElement } from './Hud.js';

/** Lo que el menú de pausa necesita comunicar hacia fuera. */
export interface PauseHandlers {
  onResume(): void;
  /** Reiniciar la operación en curso desde cero. */
  onRetry(): void;
  /** Guardar el intento y volver a la portada. */
  onExit(): void;
}

/**
 * ============================================================================
 * MENÚ DE PAUSA
 * ============================================================================
 *
 * Está por una razón concreta: en un teléfono, en mitad de una clase,
 * *cualquier* cosa puede interrumpir una partida —una pregunta del profesor,
 * una notificación, el timbre—, y hasta ahora la única salida era recargar la
 * página y perder el intento.
 *
 * **El reloj de la operación se detiene mientras está abierto.** Es lo que
 * hace que abrir el menú sea gratis: en un juego cuyo mensaje es "actúa a
 * tiempo", una pausa que siguiera contando sería una trampa. Quien lo abre
 * para mirar el mapa tampoco gana nada: la partida está congelada para los dos
 * bandos.
 *
 * Las cuatro opciones cubren lo que de verdad se pide en el aula: seguir,
 * repetir la operación que se está atascando, ganar pantalla, y salir sin
 * perder lo conseguido.
 */
export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly info: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly fullscreenButton: HTMLButtonElement;

  constructor(private readonly handlers: PauseHandlers) {
    this.root = requireElement('pause-screen');
    this.info = requireElement('pause-info');
    this.toggleButton = requireElement('btn-pause') as HTMLButtonElement;
    this.fullscreenButton = requireElement('pause-fullscreen') as HTMLButtonElement;

    (requireElement('pause-resume') as HTMLButtonElement).addEventListener('click', () =>
      this.handlers.onResume(),
    );
    (requireElement('pause-retry') as HTMLButtonElement).addEventListener('click', () => {
      if (confirm('¿Reiniciar esta operación desde el principio?')) this.handlers.onRetry();
    });
    (requireElement('pause-exit') as HTMLButtonElement).addEventListener('click', () =>
      this.handlers.onExit(),
    );
    this.fullscreenButton.addEventListener('click', () => void toggleFullscreen());
    this.fullscreenButton.hidden = !fullscreenSupported();

    // El botón de la esquina abre y cierra; la tecla Escape es el atajo que
    // cualquiera prueba primero en un ordenador.
    this.toggleButton.addEventListener('click', () => {
      if (this.visible) this.handlers.onResume();
      else this.requestOpen?.();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.visible) this.handlers.onResume();
      else this.requestOpen?.();
    });
  }

  /**
   * Quién decide si se puede pausar.
   *
   * El menú no lo sabe: depende de si hay una partida en curso, y eso lo sabe
   * el juego. Se inyecta en lugar de consultarlo para que esta clase siga sin
   * conocer nada del estado de la campaña.
   */
  requestOpen: (() => void) | null = null;

  /** Muestra u oculta el botón de la esquina (solo durante la partida). */
  setToggleVisible(visible: boolean): void {
    this.toggleButton.hidden = !visible;
    if (!visible) this.hide();
  }

  show(level: LevelDef, elapsed: number): void {
    const remaining = Math.max(0, level.timeLimitSec - elapsed);
    this.info.textContent =
      `Operación ${level.id} · ${level.title}\n` +
      `Tiempo restante: ${formatTime(remaining)} — el reloj está detenido.`;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }
}
