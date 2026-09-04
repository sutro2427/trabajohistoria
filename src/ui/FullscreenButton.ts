import { fullscreenSupported, isFullscreen, toggleFullscreen } from './fullscreen.js';
import { requireElement } from './Hud.js';

/**
 * Botón de pantalla completa de la esquina, con el mismo comportamiento que el
 * de un vídeo.
 *
 * En un teléfono es imprescindible: la barra de direcciones se come un tercio
 * de la altura útil en horizontal, y ese tercio es justo donde vive el campo
 * de batalla.
 *
 * Aquí solo está el botón; el cómo vive en `fullscreen.ts`, compartido con la
 * portada y el menú de pausa. Lo propio de esta clase es una sola cosa: el
 * icono refleja el estado REAL escuchando `fullscreenchange`, no lo que
 * creemos haber pedido, porque el usuario puede salir con el botón "atrás" del
 * sistema y el icono tiene que enterarse.
 */
export class FullscreenButton {
  private readonly button: HTMLButtonElement;

  constructor() {
    this.button = requireElement('btn-fullscreen') as HTMLButtonElement;

    // Sin soporte, el botón sobra: en iPhone, Safari no lo permite para
    // elementos arbitrarios y enseñar un botón que no hace nada es peor que no
    // enseñarlo. La portada explica ahí la alternativa (instalar la página).
    if (!fullscreenSupported()) {
      this.button.hidden = true;
      return;
    }

    this.button.addEventListener('click', () => void toggleFullscreen());
    document.addEventListener('fullscreenchange', () => this.syncIcon());
    this.syncIcon();
  }

  private syncIcon(): void {
    const active = isFullscreen();
    this.button.classList.toggle('is-fullscreen', active);
    this.button.title = active ? 'Salir de pantalla completa' : 'Pantalla completa';
    this.button.setAttribute('aria-label', this.button.title);
  }
}
