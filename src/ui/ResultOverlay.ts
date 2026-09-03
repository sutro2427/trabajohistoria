import { formatTime } from '../core/math.js';
import type { LevelDef } from '../domain/balance/types.js';
import { TOTAL_LEVELS } from '../domain/balance/levels.js';
import type { ManagementSummary } from '../campaign/CampaignRun.js';
import { requireElement } from './Hud.js';

/** Contenido de la pantalla superpuesta. */
export interface OverlayContent {
  readonly title: string;
  readonly body: string;
  /** Datos destacados en fila: pares etiqueta/valor. */
  readonly stats?: readonly { label: string; value: string }[];
  /** Tarjetas grandes del resumen final de campaña. */
  readonly summary?: readonly { label: string; value: string }[];
  /** Frase de cierre destacada. */
  readonly moral?: string;
  readonly actionLabel: string;
  /** Acción secundaria opcional (por ejemplo, ver la tabla). */
  readonly secondaryLabel?: string;
}

/**
 * Pantalla superpuesta: informe de misión, victoria, derrota y cierre de campaña.
 *
 * Es la que da sentido a lo que ocurre en el campo de batalla. Sin ella, ganar
 * sería que los sprites dejan de moverse; con ella, ganar es superar una
 * operación y avanzar hacia el premio.
 */
export class ResultOverlay {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly action: HTMLButtonElement;

  private onAction: (() => void) | null = null;
  private onSecondary: (() => void) | null = null;
  private secondaryButton: HTMLButtonElement | null = null;

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

  show(content: OverlayContent, onAction: () => void, onSecondary?: () => void): void {
    this.title.textContent = content.title;
    this.body.textContent = content.body;
    this.action.textContent = content.actionLabel;
    this.onAction = onAction;
    this.onSecondary = onSecondary ?? null;

    this.stats.replaceChildren();

    // Resumen grande de campaña: tarjetas con la cifra por delante.
    if (content.summary) {
      const grid = document.createElement('div');
      grid.className = 'summary';
      for (const card of content.summary) {
        const box = document.createElement('div');
        box.className = 'summary-card';
        const value = document.createElement('span');
        value.className = 'summary-value';
        value.textContent = card.value;
        const label = document.createElement('span');
        label.className = 'summary-label';
        label.textContent = card.label;
        box.append(value, label);
        grid.append(box);
      }
      this.stats.append(grid);
    }

    // Frase de cierre.
    if (content.moral) {
      const moral = document.createElement('p');
      moral.className = 'moral';
      moral.textContent = content.moral;
      this.stats.append(moral);
    }

    // Datos sueltos en línea.
    for (const stat of content.stats ?? []) {
      const span = document.createElement('span');
      span.append(`${stat.label}: `);
      const strong = document.createElement('b');
      strong.textContent = stat.value;
      span.append(strong);
      this.stats.append(span);
    }

    // El botón secundario se crea y se destruye con cada pantalla, para que no
    // sobreviva a una en la que no tiene sentido.
    this.secondaryButton?.remove();
    this.secondaryButton = null;
    if (content.secondaryLabel && onSecondary) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset['testid'] = 'overlay-secondary';
      button.textContent = content.secondaryLabel;
      button.addEventListener('click', () => this.onSecondary?.());
      // Se cuelga del mismo contenedor que el botón principal para que los dos
      // queden en una fila; suelto en el panel caía descolgado a un lado.
      this.action.parentElement?.insertBefore(button, this.action.nextSibling);
      this.secondaryButton = button;
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

  // -------------------------------------------------------------------------
  // Pantallas concretas
  // -------------------------------------------------------------------------

  /** Informe previo a una operación. */
  static briefing(level: LevelDef): OverlayContent {
    return {
      title: `Operación ${level.id} · ${level.title}`,
      body: level.briefing,
      stats: [
        { label: 'Objetivo', value: level.objective },
        { label: 'Progreso', value: `${level.id} de ${TOTAL_LEVELS}` },
      ],
      actionLabel: 'Desplegar',
    };
  }

  /** Nivel superado, pero queda campaña por delante. */
  static levelCleared(level: LevelDef, elapsed: number, kills: number): OverlayContent {
    return {
      title: 'Posición tomada',
      body:
        `${level.title} está bajo control.\n` +
        'Los suministros capturados viajan contigo a la siguiente operación.',
      stats: [
        { label: 'Tiempo', value: formatTime(elapsed) },
        { label: 'Bajas enemigas', value: String(kills) },
        { label: 'Operación', value: `${level.id} de ${TOTAL_LEVELS}` },
      ],
      actionLabel: 'Siguiente operación',
      secondaryLabel: 'Ver posiciones',
    };
  }

  /**
   * Campaña completada: el cierre del juego.
   *
   * Aquí es donde el juego dice lo que quería decir. En lugar de felicitar sin
   * más, le devuelve al alumno sus propias cifras —cuánto administró, cuánto
   * desperdició, a qué ritmo decidió— y deja que la conclusión salga de ellas.
   */
  static campaignComplete(summary: ManagementSummary, playerName: string): OverlayContent {
    return {
      title: '🏆 Campaña completada',
      body: `${playerName}, has tomado las tres posiciones.`,
      summary: [
        { label: 'Tiempo total', value: formatTime(summary.seconds) },
        { label: 'Suministros movidos', value: String(summary.harvested) },
        { label: 'Eficiencia', value: `${summary.efficiency}%` },
        { label: 'Bajas por pérdida', value: `${summary.exchangeRatio}` },
      ],
      moral: buildMoral(summary),
      stats: [
        { label: 'Sin usar', value: `${summary.leftover} suministros` },
        { label: 'Derrotas', value: String(summary.defeats) },
      ],
      actionLabel: 'Ver posiciones',
      secondaryLabel: 'Jugar de nuevo',
    };
  }

  /** Derrota: se repite el mismo nivel. */
  static defeat(level: LevelDef, elapsed: number, reason: string): OverlayContent {
    return {
      title: 'Operación fracasada',
      body: reason,
      stats: [
        { label: 'Operación', value: `${level.id} · ${level.title}` },
        { label: 'Tiempo', value: formatTime(elapsed) },
      ],
      actionLabel: 'Reintentar',
    };
  }
}

/**
 * Redacta la conclusión a partir de cómo jugó realmente el alumno.
 *
 * Un texto fijo se lee una vez y se olvida. Uno que señala *su* error —"dejaste
 * un tercio de tus suministros sin usar"— es el que hace que la idea se quede.
 */
function buildMoral(summary: ManagementSummary): string {
  const base =
    'En una guerra no gana quien tiene más recursos, sino quien los pone a trabajar antes. ';

  if (summary.efficiency < 60) {
    return (
      base +
      `Terminaste con ${summary.leftover} suministros sin usar: eso es ${100 - summary.efficiency}% ` +
      'de tu economía parada en el almacén mientras tus soldados peleaban en inferioridad. ' +
      'El capital ocioso no defiende posiciones.'
    );
  }

  if (summary.exchangeRatio < 1.2) {
    return (
      base +
      `Cambiaste casi una baja propia por cada enemiga (${summary.exchangeRatio} a 1). ` +
      'Ganaste por insistencia, no por ventaja: llegar antes con la unidad adecuada ' +
      'cuesta menos que llegar tarde con el doble de tropa.'
    );
  }

  if (summary.defeats === 0) {
    return (
      base +
      `Lo hiciste sin perder una sola operación, moviendo ${summary.harvested} suministros ` +
      `con un ${summary.efficiency}% de eficiencia. Eso no es suerte: es administrar y decidir a tiempo.`
    );
  }

  return (
    base +
    `Convertiste el ${summary.efficiency}% de lo que recolectaste en fuerza real y cambiaste ` +
    `${summary.exchangeRatio} bajas enemigas por cada una tuya. Perdiste ${summary.defeats} ` +
    'operación(es) por el camino, y aprendiste de ellas: así se administra bajo presión.'
  );
}
