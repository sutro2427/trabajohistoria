import {
  DIFFICULTY_ORDER,
  getAiProfile,
  type DifficultyId,
} from '../domain/balance/difficulty.js';
import type { LevelDef } from '../domain/balance/types.js';
import { requireElement } from './Hud.js';

/** Lo que el menú necesita saber del progreso guardado. */
export interface MenuProgress {
  readonly victories: number;
  readonly bestTimeSec: Readonly<Record<string, number>>;
}

/**
 * ============================================================================
 * MENÚ PRINCIPAL
 * ============================================================================
 *
 * Pantalla de entrada de la operación. Cumple tres funciones, en este orden de
 * importancia:
 *
 *  1. **Dar identidad.** El título ocupa el primer tercio y va sobre el propio
 *     campo de batalla en movimiento —selva, humo, helicópteros—, no sobre un
 *     fondo plano. El juego se presenta enseñándose.
 *
 *  2. **Elegir dificultad, y que se note.** No basta con marcar el botón: la
 *     línea de confirmación bajo los tres botones dice en voz alta cuál está
 *     seleccionada y qué implica, porque la diferencia entre Normal e
 *     Imposible no es cosmética y el jugador debe entrar sabiendo a qué juega.
 *
 *  3. **Entrar rápido.** Un solo botón y ninguna pantalla intermedia entre
 *     JUGAR y el primer recolector.
 *
 * Los botones son HTML sobre el lienzo, como el resto de la interfaz: foco de
 * teclado y accesibilidad gratis, y tests que pulsan por `data-testid`.
 */
export class MainMenu {
  private readonly root: HTMLElement;
  private readonly brief: HTMLElement;
  private readonly group: HTMLElement;
  private readonly note: HTMLElement;
  private readonly play: HTMLButtonElement;
  private readonly foot: HTMLElement;

  private readonly buttons = new Map<DifficultyId, HTMLButtonElement>();
  private selected: DifficultyId = 'normal';
  private onPlay: ((difficulty: DifficultyId) => void) | null = null;

  constructor(private readonly onDifficultyChange?: (id: DifficultyId) => void) {
    this.root = requireElement('main-menu');
    this.brief = requireElement('menu-brief');
    this.group = requireElement('menu-difficulties');
    this.note = requireElement('menu-note');
    this.play = requireElement('menu-play') as HTMLButtonElement;
    this.foot = requireElement('menu-foot');

    this.buildDifficultyButtons();

    this.play.addEventListener('click', () => {
      const handler = this.onPlay;
      this.hide();
      handler?.(this.selected);
    });

    // Navegación con flechas dentro del grupo, como en cualquier grupo de
    // opciones nativo. Se escucha en el grupo y no en `window` para no chocar
    // con los atajos de partida (1, 2, A, D, R y el desplazamiento de cámara).
    this.group.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;
      e.preventDefault();
      const i = DIFFICULTY_ORDER.indexOf(this.selected);
      const next = DIFFICULTY_ORDER[
        (i + step + DIFFICULTY_ORDER.length) % DIFFICULTY_ORDER.length
      ] as DifficultyId;
      this.select(next);
      this.buttons.get(next)?.focus();
    });
  }

  /** Crea un botón por dificultad a partir del catálogo, sin listarlas a mano. */
  private buildDifficultyButtons(): void {
    this.group.innerHTML = '';
    for (const id of DIFFICULTY_ORDER) {
      const profile = getAiProfile(id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-difficulty';
      button.textContent = profile.label;
      button.id = `btn-difficulty-${id}`;
      button.dataset['testid'] = `btn-difficulty-${id}`;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.addEventListener('click', () => this.select(id));
      this.group.append(button);
      this.buttons.set(id, button);
    }
  }

  /**
   * Muestra el menú.
   *
   * @param difficulty Dificultad preseleccionada (la última que se jugó).
   */
  show(
    level: LevelDef,
    progress: MenuProgress,
    difficulty: DifficultyId,
    onPlay: (difficulty: DifficultyId) => void,
  ): void {
    this.brief.textContent = level.briefing;
    this.onPlay = onPlay;
    this.select(difficulty);

    const best = progress.bestTimeSec[String(level.id)];
    this.foot.textContent =
      best === undefined
        ? `Sector: ${level.title}  ·  Objetivo: ${level.objective}`
        : `Sector: ${level.title}  ·  Victorias: ${progress.victories}  ·  Mejor tiempo: ${formatShort(best)}`;

    this.root.hidden = false;
    this.play.focus();
  }

  hide(): void {
    this.root.hidden = true;
    this.onPlay = null;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Dificultad actualmente marcada. */
  get difficulty(): DifficultyId {
    return this.selected;
  }

  /** Marca una dificultad y actualiza la línea de confirmación. */
  select(id: DifficultyId): void {
    this.selected = id;
    const profile = getAiProfile(id);

    for (const [key, button] of this.buttons) {
      const active = key === id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
      // Solo el seleccionado es tabulable, como en un grupo de radios real.
      button.tabIndex = active ? 0 : -1;
    }

    // La confirmación explícita: qué está elegido y qué significa.
    this.note.innerHTML = '';
    const label = document.createElement('b');
    label.textContent = profile.label.toUpperCase();
    this.note.append('Dificultad seleccionada: ', label, ` — ${profile.description}`);

    this.onDifficultyChange?.(id);
  }
}

/** "2:41" a partir de segundos. Local al menú: es el único sitio que lo usa así. */
function formatShort(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}
