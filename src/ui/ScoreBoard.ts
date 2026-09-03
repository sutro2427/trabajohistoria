import { rankEntries, type ScoreEntry } from '../campaign/CampaignRun.js';
import { TOTAL_LEVELS } from '../domain/balance/levels.js';
import { formatTime } from '../core/math.js';
import type { LobbySnapshot } from '../campaign/ICompetition.js';
import { requireElement } from './Hud.js';

/**
 * ============================================================================
 * TABLA DE POSICIONES
 * ============================================================================
 *
 * Es la pantalla que se proyecta en clase, así que prioriza legibilidad a
 * distancia sobre densidad de información: posición, nombre, niveles y tiempo.
 * Nada más.
 *
 * Quien ha completado los tres niveles lleva un trofeo, y la fila del propio
 * jugador va resaltada para que cada alumno se encuentre de un vistazo en una
 * lista de treinta.
 */
export class ScoreBoard {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly title: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly toggle: HTMLButtonElement;

  /** Botones que solo ve el profesor. */
  private adminButtons: HTMLButtonElement[] = [];

  /**
   * Último estado conocido de la sala.
   *
   * Se guarda porque el panel se pinta cuando llega un cambio, pero se abre
   * cuando el jugador pulsa el botón — dos momentos distintos. Sin recordarlo,
   * abrir el panel entre dos cambios lo mostraba vacío.
   */
  private lastSnapshot: LobbySnapshot = { state: 'lobby', startedAt: null, participants: [] };
  private lastOnline = false;

  constructor(private myName: string = '') {
    this.root = requireElement('board-screen');
    this.list = requireElement('board-list');
    this.title = requireElement('board-title');
    this.actions = requireElement('board-actions');
    this.closeButton = requireElement('board-close') as HTMLButtonElement;
    this.toggle = requireElement('btn-board') as HTMLButtonElement;

    this.closeButton.addEventListener('click', () => this.hide());
    this.toggle.addEventListener('click', () => this.show());
  }

  setPlayerName(name: string): void {
    this.myName = name;
  }

  /** Muestra u oculta el botón flotante de acceso rápido. */
  setToggleVisible(visible: boolean): void {
    this.toggle.hidden = !visible;
  }

  show(): void {
    // Se repinta con lo último que se sabe de la sala antes de mostrarlo.
    this.render(this.lastSnapshot, this.lastOnline);
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /**
   * Añade los controles del profesor.
   *
   * Solo se llama cuando la URL trae la clave de administrador, así que un
   * alumno no puede dar la salida ni borrar la sala aunque lo intente desde
   * la consola: los botones sencillamente no existen en su página.
   */
  enableAdmin(onStart: () => void, onReset: () => void): void {
    for (const button of this.adminButtons) button.remove();

    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'btn btn-primary';
    start.dataset['testid'] = 'btn-admin-start';
    start.textContent = 'Dar la salida';
    start.addEventListener('click', onStart);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn';
    reset.dataset['testid'] = 'btn-admin-reset';
    reset.textContent = 'Reiniciar sala';
    reset.addEventListener('click', () => {
      // Borra el progreso de toda la clase: se confirma antes.
      if (confirm('¿Reiniciar la sala? Se borrará el progreso de todos.')) onReset();
    });

    this.adminButtons = [start, reset];
    this.actions.prepend(start, reset);
  }

  /** Pinta la tabla a partir del estado de la sala. */
  render(snapshot: LobbySnapshot, online: boolean): void {
    this.lastSnapshot = snapshot;
    this.lastOnline = online;

    const entries: ScoreEntry[] = snapshot.participants
      .map((p) => p.score)
      .filter((s): s is ScoreEntry => s !== null);

    // Quien ha entrado pero aún no ha terminado ningún nivel también aparece:
    // ver el nombre propio en la lista desde el minuto cero anima a competir.
    for (const p of snapshot.participants) {
      if (p.score === null) {
        entries.push({
          name: p.name,
          levelsDone: 0,
          seconds: 0,
          finishedAt: null,
          defeats: 0,
          updatedAt: p.joinedAt,
        });
      }
    }

    const ranked = rankEntries(entries);
    const champion = ranked.find((e) => e.levelsDone >= TOTAL_LEVELS);

    this.title.textContent = champion
      ? `🏆 Ganador: ${champion.name}`
      : online
        ? 'Tabla de posiciones'
        : 'Tu progreso';

    if (ranked.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'board-empty';
      empty.textContent = 'Todavía no hay jugadores en la sala.';
      this.list.replaceChildren(empty);
      return;
    }

    this.list.replaceChildren(
      ...ranked.map((entry) => {
        const li = document.createElement('li');
        li.classList.toggle('is-you', entry.name === this.myName);
        li.classList.toggle('is-champion', entry.levelsDone >= TOTAL_LEVELS);

        const name = document.createElement('span');
        name.className = 'board-name';
        name.textContent = entry.name;

        const levels = document.createElement('span');
        levels.className = 'board-levels';
        levels.textContent = `${entry.levelsDone}/${TOTAL_LEVELS}`;

        const time = document.createElement('span');
        time.className = 'board-time';
        // Sin niveles completados no hay tiempo que enseñar: un "0:00" haría
        // parecer que va ganando.
        time.textContent = entry.levelsDone > 0 ? formatTime(entry.seconds) : '—';

        li.append(name, levels, time);
        return li;
      }),
    );
  }
}
