import type { EventBus, Unsubscribe } from '../core/EventBus.js';
import { getPowerDef, getUnitDef } from '../domain/balance/balance.js';
import type { Stance } from '../domain/balance/types.js';
import type { GameEvents } from '../domain/events.js';
import { requireElement } from './Hud.js';

/** Acciones que la barra emite hacia la escena. */
export interface CommandBarHandlers {
  onTrain(defId: string): void;
  onStance(stance: Stance): void;
  /** El jugador ha elegido un objetivo para un poder, en coordenadas del mundo. */
  onLaunchPower(powerId: string, worldX: number): void;
}

/** Lo que la barra necesita saber del estado de la partida para refrescarse. */
export interface CommandBarState {
  readonly supplies: number;
  readonly queue: { defId: string; remaining: number; total: number } | undefined;
  readonly interactive: boolean;
  /** Enfriamiento restante de cada poder, en segundos. */
  readonly powerCooldowns: ReadonlyMap<string, number>;
  /** Coordenada del mundo en el borde izquierdo de la pantalla. */
  readonly cameraX: number;
}

/**
 * ============================================================================
 * BARRA DE MANDO
 * ============================================================================
 *
 * Produce los botones **a partir del nivel**, no de una lista fija en el HTML:
 * el nivel 1 muestra soldado y recolector, el 3 añade francotirador, tanque y
 * bombas de racimo. Añadir una unidad al catálogo la hace aparecer aquí sin
 * tocar este archivo.
 *
 * Además gestiona el *modo de puntería*: al pulsar un poder, la barra no lo
 * lanza — arma el poder y espera a que el jugador toque un punto del campo.
 * Ese segundo paso es lo que convierte el bombardeo en una decisión táctica.
 */
export class CommandBar {
  private readonly productionRoot: HTMLElement;
  private readonly powersSection: HTMLElement;
  private readonly powersRoot: HTMLElement;
  private readonly stanceButtons: ReadonlyMap<Stance, HTMLButtonElement>;
  private readonly queueFill: HTMLElement;
  private readonly queueText: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly aimLayer: HTMLElement;
  private readonly aimHint: HTMLElement;

  private buyButtons = new Map<string, HTMLButtonElement>();
  private powerButtons = new Map<string, HTMLButtonElement>();

  /**
   * Todo lo que hay que soltar al destruir la barra.
   *
   * La versión anterior añadía un `keydown` a `window` en cada partida sin
   * retirar el anterior: a la décima partida había diez manejadores activos y
   * cada tecla se procesaba diez veces. Registrar las bajas aquí lo evita.
   */
  private readonly cleanups: Unsubscribe[] = [];

  /** Poder a la espera de que el jugador señale un objetivo. */
  private armedPower: string | null = null;
  private toastTimer = 0;

  constructor(
    bus: EventBus<GameEvents>,
    private readonly handlers: CommandBarHandlers,
    private logicalWidth: number,
  ) {
    this.productionRoot = requireElement('production-buttons');
    this.powersSection = requireElement('powers-section');
    this.powersRoot = requireElement('power-buttons');
    this.queueFill = requireElement('queue-fill');
    this.queueText = requireElement('queue-text');
    this.toast = requireElement('toast');
    this.aimLayer = requireElement('aim-layer');
    this.aimHint = requireElement('aim-hint');

    this.stanceButtons = new Map<Stance, HTMLButtonElement>([
      ['attack', requireElement('btn-attack') as HTMLButtonElement],
      ['defend', requireElement('btn-defend') as HTMLButtonElement],
      ['retreat', requireElement('btn-retreat') as HTMLButtonElement],
    ]);

    for (const [stance, button] of this.stanceButtons) {
      this.listen(button, 'click', () => this.handlers.onStance(stance));
    }

    this.listen(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(this.aimLayer, 'pointerdown', (e) => this.onAimPointer(e as PointerEvent));
    this.listen(requireElement('aim-cancel'), 'click', (e) => {
      e.stopPropagation();
      this.disarm();
    });

    this.cleanups.push(
      bus.on('stance:changed', ({ team, stance }) => {
        if (team === 'US') this.highlightStance(stance);
      }),
      bus.on('training:rejected', ({ team, reason }) => {
        if (team !== 'US') return;
        this.showToast(
          {
            supplies: 'Suministros insuficientes',
            population: 'Límite de población alcanzado',
            locked: 'Necesitas los planos para construirlo',
            queue: 'Cola de entrenamiento llena',
          }[reason],
        );
      }),
      bus.on('power:rejected', ({ team }) => {
        if (team === 'US') this.showToast('Suministros insuficientes');
      }),
    );
  }

  /**
   * Ajusta el ancho lógico tras un cambio de tamaño.
   * Sin esto, tras girar el teléfono las bombas caerían desplazadas respecto
   * al punto que tocó el jugador.
   */
  setLogicalWidth(width: number): void {
    this.logicalWidth = width;
  }

  /** Registra un oyente del DOM y apunta su baja. */
  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.cleanups.push(() => target.removeEventListener(type, fn));
  }

  /**
   * Construye los botones del nivel.
   * Se llama al empezar cada partida, porque las unidades disponibles cambian.
   */
  buildFor(buildable: readonly string[], powers: readonly string[]): void {
    this.disarm();
    this.productionRoot.replaceChildren();
    this.powersRoot.replaceChildren();
    this.buyButtons = new Map();
    this.powerButtons = new Map();

    for (const defId of buildable) {
      const def = getUnitDef(defId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-buy';
      button.id = `btn-buy-${defId}`;
      button.dataset['testid'] = `btn-buy-${defId}`;
      button.title = `${def.name} — ${def.cost} suministros, ${def.population} de población`;
      // El nombre corto evita que cinco botones se solapen en un teléfono;
      // el completo queda en el `title` para quien pase el ratón por encima.
      button.innerHTML =
        `<span class="btn-name">${def.shortName ?? def.name}</span>` +
        `<span class="btn-cost"><span class="icon icon-supply" aria-hidden="true"></span>${def.cost}</span>`;
      this.listen(button, 'click', () => this.handlers.onTrain(defId));
      this.productionRoot.append(button);
      this.buyButtons.set(defId, button);
    }

    this.powersSection.hidden = powers.length === 0;
    for (const powerId of powers) {
      const def = getPowerDef(powerId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-power';
      button.id = `btn-power-${powerId}`;
      button.dataset['testid'] = `btn-power-${powerId}`;
      button.title = `${def.name} — ${def.cost} suministros`;
      button.innerHTML =
        `<span class="cooldown-veil"></span>` +
        `<span class="btn-name">${def.shortName ?? def.name}</span>` +
        `<span class="btn-cost"><span class="icon icon-supply" aria-hidden="true"></span>${def.cost}</span>`;
      this.listen(button, 'click', () => this.arm(powerId));
      this.powersRoot.append(button);
      this.powerButtons.set(powerId, button);
    }
  }

  // -------------------------------------------------------------------------
  // Modo de puntería
  // -------------------------------------------------------------------------

  /** Arma un poder: el siguiente toque en el campo elige dónde cae. */
  private arm(powerId: string): void {
    if (this.armedPower === powerId) {
      this.disarm();
      return;
    }
    this.armedPower = powerId;
    this.aimLayer.hidden = false;
    this.aimHint.textContent = `${getPowerDef(powerId).name}: toca el objetivo`;
    for (const [id, button] of this.powerButtons) {
      button.classList.toggle('is-armed', id === powerId);
    }
  }

  private disarm(): void {
    this.armedPower = null;
    this.aimLayer.hidden = true;
    for (const button of this.powerButtons.values()) button.classList.remove('is-armed');
  }

  /**
   * Convierte el toque en una coordenada del mundo y lanza el poder.
   *
   * La conversión tiene que pasar por el ancho real en pantalla porque el
   * canvas se muestra escalado: usar los píxeles del evento sin convertir
   * haría caer las bombas en un sitio distinto en cada tamaño de pantalla.
   */
  private onAimPointer(e: PointerEvent): void {
    if (!this.armedPower) return;
    e.preventDefault();

    const rect = this.aimLayer.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const worldX = this.pendingCameraX + ratio * this.logicalWidth;

    const powerId = this.armedPower;
    this.disarm();
    this.handlers.onLaunchPower(powerId, worldX);
  }

  /** Última posición conocida de la cámara, para traducir el toque. */
  private pendingCameraX = 0;

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.key === 'Escape' && this.armedPower) {
      this.disarm();
      return;
    }

    const key = e.key.toLowerCase();

    // Atajos de compra: la tecla la declara la propia unidad en el catálogo.
    for (const defId of this.buyButtons.keys()) {
      if (getUnitDef(defId).hotkey?.toLowerCase() === key) {
        this.handlers.onTrain(defId);
        return;
      }
    }
    for (const powerId of this.powerButtons.keys()) {
      if (getPowerDef(powerId).hotkey?.toLowerCase() === key) {
        this.arm(powerId);
        return;
      }
    }

    const stance = ({ a: 'attack', d: 'defend', r: 'retreat' } as const)[
      key as 'a' | 'd' | 'r'
    ];
    if (stance) this.handlers.onStance(stance);
  }

  // -------------------------------------------------------------------------
  // Refresco
  // -------------------------------------------------------------------------

  highlightStance(stance: Stance): void {
    for (const [id, button] of this.stanceButtons) {
      button.classList.toggle('is-active', id === stance);
    }
  }

  update(dt: number, state: CommandBarState): void {
    this.pendingCameraX = state.cameraX;

    // Deshabilitar lo que no se puede pagar comunica el estado de la economía
    // sin que el jugador tenga que leer el contador.
    for (const [defId, button] of this.buyButtons) {
      button.disabled =
        !state.interactive ||
        state.supplies < getUnitDef(defId).cost ||
        state.queue !== undefined;
    }

    for (const [powerId, button] of this.powerButtons) {
      const cooldown = state.powerCooldowns.get(powerId) ?? 0;
      const def = getPowerDef(powerId);
      button.disabled = !state.interactive || cooldown > 0 || state.supplies < def.cost;
      const veil = button.querySelector<HTMLElement>('.cooldown-veil');
      if (veil) {
        // El velo se vacía de abajo arriba conforme avanza el enfriamiento.
        veil.style.transform = `scaleY(${Math.max(0, Math.min(1, cooldown / def.cooldown))})`;
      }
    }

    for (const button of this.stanceButtons.values()) {
      button.disabled = !state.interactive;
    }

    if (state.queue) {
      const progress = 1 - state.queue.remaining / state.queue.total;
      this.queueFill.style.width = `${Math.round(progress * 100)}%`;
      this.queueText.textContent = `${getUnitDef(state.queue.defId).name} ${state.queue.remaining.toFixed(1)}s`;
    } else {
      this.queueFill.style.width = '0%';
      this.queueText.textContent = '—';
    }

    if (!state.interactive && this.armedPower) this.disarm();

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.hidden = true;
    }
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toastTimer = 1.6;
    // En móvil no hay `:hover` ni sonido: la vibración es la única forma de
    // avisar de que la acción se ha rechazado sin mirar el texto.
    navigator.vibrate?.(40);
  }

  /** Suelta todos los oyentes. Imprescindible al reconstruir la barra. */
  destroy(): void {
    this.disarm();
    for (const off of this.cleanups) off();
    this.cleanups.length = 0;
  }
}
