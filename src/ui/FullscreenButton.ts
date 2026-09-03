import { requireElement } from './Hud.js';

/**
 * Botón de pantalla completa, con el mismo comportamiento que el de un vídeo.
 *
 * En un teléfono es imprescindible: la barra de direcciones del navegador se
 * come un tercio de la altura útil cuando se juega en horizontal, y ese tercio
 * es justo donde vive el campo de batalla.
 *
 * Detalles que hacen que funcione de verdad en un móvil:
 *
 *  · Solo se puede pedir dentro de un gesto del usuario. Por eso es un botón y
 *    no algo automático al cargar.
 *  · Se intenta además bloquear la orientación en horizontal. Falla en iOS
 *    —donde la API no existe— y ahí no pasa nada: el aviso de "gira el
 *    teléfono" cubre ese caso.
 *  · El icono refleja el estado real escuchando `fullscreenchange`, no lo que
 *    creemos haber pedido: el usuario puede salir con el botón "atrás" del
 *    sistema y el icono debe enterarse.
 */
export class FullscreenButton {
  private readonly button: HTMLButtonElement;
  private readonly root = document.documentElement;

  constructor() {
    this.button = requireElement('btn-fullscreen') as HTMLButtonElement;

    // Sin soporte, el botón sobra: en iPhone, Safari no lo permite para
    // elementos arbitrarios y enseñar un botón que no hace nada es peor que
    // no enseñarlo.
    if (!this.root.requestFullscreen) {
      this.button.hidden = true;
      return;
    }

    this.button.addEventListener('click', () => void this.toggle());
    document.addEventListener('fullscreenchange', () => this.syncIcon());
    this.syncIcon();
  }

  private async toggle(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await this.root.requestFullscreen({ navigationUI: 'hide' });

      // Bloquear el giro es un extra: si el navegador no deja, se sigue
      // jugando igual.
      const orientation = screen.orientation as
        | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
        | undefined;
      await orientation?.lock?.('landscape').catch(() => undefined);
    } catch {
      // El navegador puede rechazarlo (política, permisos, iOS). No es un
      // error del juego y no debe interrumpir la partida.
    }
  }

  private syncIcon(): void {
    const active = document.fullscreenElement !== null;
    this.button.classList.toggle('is-fullscreen', active);
    this.button.title = active ? 'Salir de pantalla completa' : 'Pantalla completa';
    this.button.setAttribute('aria-label', this.button.title);
  }
}
