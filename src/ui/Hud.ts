import { formatTime } from '../core/math.js';
import type { EventBus } from '../core/EventBus.js';
import type { GameEvents } from '../domain/events.js';

/**
 * Marcador superior: suministros, población, objetivo y cronómetro.
 *
 * Se alimenta **solo del bus de eventos**. No consulta el mundo ni guarda una
 * referencia a la simulación: el dominio anuncia que los suministros han
 * cambiado y la interfaz reacciona. Esa dirección única de dependencia es lo
 * que permite que la simulación corra sin navegador.
 */
export class Hud {
  private readonly supplies: HTMLElement;
  private readonly suppliesChip: HTMLElement;
  private readonly population: HTMLElement;
  private readonly populationMax: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly timer: HTMLElement;

  /** Segundos que queda resaltado el contador tras un cambio. */
  private highlightTimer = 0;

  constructor(bus: EventBus<GameEvents>) {
    this.supplies = requireElement('hud-supplies');
    this.suppliesChip = this.supplies.parentElement as HTMLElement;
    this.population = requireElement('hud-pop');
    this.populationMax = requireElement('hud-pop-max');
    this.objective = requireElement('hud-objective');
    this.timer = requireElement('hud-timer');

    bus.on('supplies:changed', ({ team, value, delta }) => {
      if (team !== 'US') return;
      this.supplies.textContent = String(Math.floor(value));
      // Verde al ingresar, rojo al gastar: el color dice qué pasó sin leer.
      this.suppliesChip.classList.toggle('is-gain', delta > 0);
      this.suppliesChip.classList.toggle('is-loss', delta < 0);
      this.highlightTimer = 0.5;
    });

    bus.on('population:changed', ({ team, current, max }) => {
      if (team !== 'US') return;
      this.population.textContent = String(current);
      this.populationMax.textContent = String(max);
    });
  }

  /** Estado inicial del marcador al empezar un nivel. */
  reset(supplies: number, population: number, populationMax: number, objective: string): void {
    this.supplies.textContent = String(Math.floor(supplies));
    this.population.textContent = String(population);
    this.populationMax.textContent = String(populationMax);
    this.objective.textContent = objective;
    this.timer.textContent = '0:00';
    this.suppliesChip.classList.remove('is-gain', 'is-loss');
  }

  update(dt: number, elapsed: number): void {
    this.timer.textContent = formatTime(elapsed);

    if (this.highlightTimer > 0) {
      this.highlightTimer -= dt;
      if (this.highlightTimer <= 0) {
        this.suppliesChip.classList.remove('is-gain', 'is-loss');
      }
    }
  }

  /** Cambia el texto de objetivo (por ejemplo, un marcador de progreso). */
  setObjective(text: string): void {
    this.objective.textContent = text;
  }
}

/** Busca un elemento obligatorio del documento y falla claro si no existe. */
export function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta el elemento "#${id}" en index.html`);
  return el;
}
