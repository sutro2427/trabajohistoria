import type { EventBus } from '../core/EventBus.js';
import type { Stance } from '../domain/balance/types.js';
import type { GameEvents } from '../domain/events.js';
import { requireElement } from './Hud.js';

/** Acciones que la barra puede emitir. La escena decide qué hacer con ellas. */
export interface CommandBarHandlers {
  onTrain(defId: string): void;
  onStance(stance: Stance): void;
}

/**
 * Barra inferior: producción, cola de entrenamiento y órdenes de escuadra.
 *
 * Los botones son elementos HTML sobre el canvas, no rectángulos dibujados.
 * Eso da foco de teclado y accesibilidad sin escribir una línea, escala solo
 * con CSS, y permite que los tests hagan clic por `data-testid` en lugar de
 * calcular coordenadas dentro del lienzo.
 */
export class CommandBar {
  private readonly buyButtons: ReadonlyMap<string, HTMLButtonElement>;
  private readonly stanceButtons: ReadonlyMap<Stance, HTMLButtonElement>;
  private readonly queueFill: HTMLElement;
  private readonly queueText: HTMLElement;
  private readonly toast: HTMLElement;

  private toastTimer = 0;

  constructor(bus: EventBus<GameEvents>, private readonly handlers: CommandBarHandlers) {
    this.buyButtons = new Map([
      ['us_rifleman', requireElement('btn-buy-soldier') as HTMLButtonElement],
      ['us_harvester', requireElement('btn-buy-harvester') as HTMLButtonElement],
    ]);
    this.stanceButtons = new Map<Stance, HTMLButtonElement>([
      ['attack', requireElement('btn-attack') as HTMLButtonElement],
      ['defend', requireElement('btn-defend') as HTMLButtonElement],
      ['retreat', requireElement('btn-retreat') as HTMLButtonElement],
    ]);
    this.queueFill = requireElement('queue-fill');
    this.queueText = requireElement('queue-text');
    this.toast = requireElement('toast');

    for (const [defId, button] of this.buyButtons) {
      button.addEventListener('click', () => this.handlers.onTrain(defId));
    }
    for (const [stance, button] of this.stanceButtons) {
      button.addEventListener('click', () => this.handlers.onStance(stance));
    }

    // Atajos de teclado: en un juego de ritmo rápido, alcanzar el ratón para
    // cada compra rompe el flujo.
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      switch (e.key.toLowerCase()) {
        case '1': this.handlers.onTrain('us_rifleman'); break;
        case '2': this.handlers.onTrain('us_harvester'); break;
        case 'a': this.handlers.onStance('attack'); break;
        case 'd': this.handlers.onStance('defend'); break;
        case 'r': this.handlers.onStance('retreat'); break;
        default: return;
      }
    });

    bus.on('stance:changed', ({ team, stance }) => {
      if (team === 'US') this.highlightStance(stance);
    });

    bus.on('training:rejected', ({ team, reason }) => {
      if (team !== 'US') return;
      this.showToast(
        {
          supplies: 'Suministros insuficientes',
          population: 'Límite de población alcanzado',
          locked: 'Necesitas los planos para construirlo',
        }[reason],
      );
    });
  }

  /** Marca visualmente la orden activa. */
  highlightStance(stance: Stance): void {
    for (const [id, button] of this.stanceButtons) {
      button.classList.toggle('is-active', id === stance);
    }
  }

  /**
   * Refresca el estado de los botones y la barra de la cola.
   *
   * Deshabilitar lo que no se puede pagar evita que el jugador pulse a ciegas
   * y comunica el estado de la economía sin necesidad de leer el número.
   */
  update(
    dt: number,
    supplies: number,
    costOf: (defId: string) => number,
    queue: { defId: string; remaining: number; total: number } | undefined,
    nameOf: (defId: string) => string,
    interactive: boolean,
  ): void {
    for (const [defId, button] of this.buyButtons) {
      button.disabled = !interactive || supplies < costOf(defId) || queue !== undefined;
    }
    for (const button of this.stanceButtons.values()) {
      button.disabled = !interactive;
    }

    if (queue) {
      const progress = 1 - queue.remaining / queue.total;
      this.queueFill.style.width = `${Math.round(progress * 100)}%`;
      this.queueText.textContent = `${nameOf(queue.defId)} ${queue.remaining.toFixed(1)}s`;
    } else {
      this.queueFill.style.width = '0%';
      this.queueText.textContent = '—';
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.hidden = true;
    }
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toastTimer = 1.6;
  }
}
