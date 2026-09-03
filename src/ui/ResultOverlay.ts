import { formatTime } from '../core/math.js';
import { requireElement } from './Hud.js';

/** Contenido de la pantalla superpuesta. */
export interface OverlayContent {
  readonly title: string;
  readonly body: string;
  /** Datos destacados: pares etiqueta/valor. */
  readonly stats?: readonly { label: string; value: string }[];
  readonly actionLabel: string;
}

/**
 * Pantalla superpuesta: sesión informativa, victoria y derrota.
 *
 * Es la que da sentido narrativo a la partida. Sin ella, ganar sería que los
 * sprites dejan de moverse; con ella, ganar es capturar los planos del tanque
 * y avanzar en la campaña.
 */
export class ResultOverlay {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly action: HTMLButtonElement;
  private onAction: (() => void) | null = null;

  constructor() {
    this.root = requireElement('overlay-screen');
    this.title = requireElement('overlay-title');
    this.body = requireElement('overlay-body');
    this.stats = requireElement('overlay-stats');
    this.action = requireElement('overlay-action') as HTMLButtonElement;

    this.action.addEventListener('click', () => {
      const handler = this.onAction;
      this.hide();
      handler?.();
    });
  }

  show(content: OverlayContent, onAction: () => void): void {
    this.title.textContent = content.title;
    this.body.textContent = content.body;
    this.action.textContent = content.actionLabel;
    this.onAction = onAction;

    this.stats.innerHTML = '';
    for (const stat of content.stats ?? []) {
      const span = document.createElement('span');
      // Se construye con nodos en lugar de innerHTML: aunque aquí el texto sea
      // nuestro, montar HTML a partir de cadenas es un hábito que acaba mal.
      span.append(`${stat.label}: `);
      const strong = document.createElement('b');
      strong.textContent = stat.value;
      span.append(strong);
      this.stats.append(span);
    }

    this.root.hidden = false;
    this.action.focus();
  }

  hide(): void {
    this.root.hidden = true;
    this.onAction = null;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Pantalla de victoria del nivel 1: se capturan los planos del tanque. */
  static victory(loot: number, elapsed: number, kills: number): OverlayContent {
    return {
      title: 'Posición tomada',
      body:
        'El puesto de mando ha caído. Entre los restos aparecen los planos de un blindado.\n' +
        'Los suministros capturados viajan contigo a la siguiente operación.',
      stats: [
        { label: 'Botín', value: `${loot} suministros` },
        { label: 'Tiempo', value: formatTime(elapsed) },
        { label: 'Bajas enemigas', value: String(kills) },
      ],
      actionLabel: 'Continuar',
    };
  }

  /** Pantalla de derrota. */
  static defeat(elapsed: number, reason: string): OverlayContent {
    return {
      title: 'Operación fracasada',
      body: reason,
      stats: [{ label: 'Tiempo', value: formatTime(elapsed) }],
      actionLabel: 'Reintentar',
    };
  }
}
