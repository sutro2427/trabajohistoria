import { formatTime } from '../core/math.js';
import { TOTAL_LEVELS } from '../domain/balance/levels.js';
import { ROOM_TTL_MS } from '../campaign/firebaseConfig.js';
import type { LobbySnapshot } from '../campaign/ICompetition.js';
import { computeRoomStats, type RoomRow } from '../campaign/roomStats.js';
import {
  checkAdminPassword,
  forgetAdminSession,
  hasAdminSession,
  rememberAdminSession,
  studentLink,
  urlPassword,
} from '../campaign/adminAccess.js';
import { requireElement } from './Hud.js';

/**
 * ============================================================================
 * PANEL DE CONTROL DEL PROFESOR
 * ============================================================================
 *
 * Se abre con `?admin` y está pensado para **proyectarse** mientras la clase
 * juega. Eso condiciona cada decisión de diseño de esta pantalla:
 *
 *  · tipografía grande y pocas cifras, porque se lee desde el fondo del aula;
 *  · el ganador ocupa la franja superior, porque es la información por la que
 *    la clase mira la pantalla;
 *  · el enlace para los alumnos aparece siempre visible, para poder dictarlo
 *    sin salir del panel;
 *  · y el reloj corre solo, para que la proyección no parezca congelada
 *    cuando pasan segundos sin que nadie termine un nivel.
 *
 * La clase no sabe nada de Firebase: recibe instantáneas de la sala y llama a
 * dos funciones que le pasan desde fuera. Sirve igual con la competencia local
 * que con la de red.
 */
export interface AdminPanelHandlers {
  readonly onStart: () => void;
  readonly onReset: () => void;
}

export class AdminPanel {
  private readonly gate: HTMLElement;
  private readonly gateForm: HTMLFormElement;
  private readonly gateInput: HTMLInputElement;
  private readonly gateError: HTMLElement;

  private readonly panel: HTMLElement;
  private readonly stateBadge: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly kpis: HTMLElement;
  private readonly rows: HTMLElement;
  private readonly link: HTMLElement;
  private readonly roomLabel: HTMLElement;

  private snapshot: LobbySnapshot = { state: 'lobby', startedAt: null, participants: [] };
  private ticker: number | null = null;

  constructor(
    private readonly handlers: AdminPanelHandlers,
    private readonly roomId: string,
    private readonly online: boolean,
  ) {
    this.gate = requireElement('admin-gate');
    this.gateForm = requireElement('admin-form') as HTMLFormElement;
    this.gateInput = requireElement('admin-password') as HTMLInputElement;
    this.gateError = requireElement('admin-error');

    this.panel = requireElement('admin-panel');
    this.stateBadge = requireElement('admin-state');
    this.clock = requireElement('admin-clock');
    this.banner = requireElement('admin-banner');
    this.kpis = requireElement('admin-kpis');
    this.rows = requireElement('admin-rows');
    this.link = requireElement('admin-link');
    this.roomLabel = requireElement('admin-room');

    this.gateForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.attempt(this.gateInput.value);
    });

    (requireElement('admin-start') as HTMLButtonElement).addEventListener('click', () =>
      this.handlers.onStart(),
    );
    (requireElement('admin-reset') as HTMLButtonElement).addEventListener('click', () => {
      // Borra el progreso de toda la clase: nunca sin confirmar, y menos
      // todavía con el panel proyectado delante de treinta personas.
      if (confirm('¿Reiniciar la sala? Se borrará el progreso de toda la clase.')) {
        this.handlers.onReset();
      }
    });
    (requireElement('admin-exit') as HTMLButtonElement).addEventListener('click', () => {
      forgetAdminSession();
      // Se vuelve al juego como un alumno más, sin el parámetro del panel.
      window.location.href = studentLink();
    });
  }

  /**
   * Abre el panel: pide la contraseña, salvo que ya venga en el enlace o que
   * esta pestaña se hubiera autenticado antes de recargar.
   */
  open(): void {
    if (hasAdminSession() || (urlPassword() !== '' && checkAdminPassword(urlPassword()))) {
      this.unlock();
      return;
    }
    this.gate.hidden = false;
    this.gateInput.focus();
  }

  /** `true` si el panel está a la vista (con o sin contraseña pedida). */
  get visible(): boolean {
    return !this.gate.hidden || !this.panel.hidden;
  }

  /** Recibe el estado de la sala y repinta. */
  render(snapshot: LobbySnapshot): void {
    this.snapshot = snapshot;
    if (this.panel.hidden) return;
    this.paint();
  }

  dispose(): void {
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.ticker = null;
  }

  // -------------------------------------------------------------------------
  // Contraseña
  // -------------------------------------------------------------------------

  private attempt(value: string): void {
    if (!checkAdminPassword(value)) {
      this.gateError.textContent = 'Contraseña incorrecta.';
      this.gateInput.select();
      return;
    }
    rememberAdminSession();
    this.unlock();
  }

  private unlock(): void {
    this.gate.hidden = true;
    this.panel.hidden = false;
    this.roomLabel.textContent = this.roomId;
    this.link.textContent = studentLink();
    this.paint();

    // El reloj de la sala corre aunque no lleguen cambios desde la red.
    if (this.ticker === null) {
      this.ticker = window.setInterval(() => this.paintClock(), 1000);
    }
  }

  // -------------------------------------------------------------------------
  // Pintado
  // -------------------------------------------------------------------------

  private paint(): void {
    const stats = computeRoomStats(this.snapshot);

    const stateText =
      this.snapshot.state === 'running'
        ? 'EN JUEGO'
        : this.snapshot.state === 'finished'
          ? 'TERMINADA'
          : 'EN ESPERA';
    this.stateBadge.textContent = stateText;
    this.stateBadge.dataset['state'] = this.snapshot.state;

    // El titular: mientras no hay ganador se explica qué se está esperando,
    // porque una franja vacía en una proyección se lee como un fallo.
    if (stats.champion) {
      this.banner.textContent = `🏆 ${stats.champion} completó las tres operaciones`;
      this.banner.classList.add('is-champion');
    } else if (this.snapshot.state === 'running') {
      this.banner.textContent = 'Operación en curso — nadie ha completado las tres todavía';
      this.banner.classList.remove('is-champion');
    } else {
      this.banner.textContent = 'Esperando a que el profesor dé la salida';
      this.banner.classList.remove('is-champion');
    }

    this.paintKpis(stats.total, stats.playing, stats.finished, stats.levelsCleared, stats.defeats);
    this.paintRows(stats.rows);
    this.paintClock();

    if (!this.online) {
      // En modo local solo se ve al jugador de este equipo: conviene decirlo
      // antes de que el profesor crea que la clase no está entrando.
      this.link.textContent = 'Sin conexión con la sala: panel en modo local.';
    }
  }

  private paintKpis(
    total: number,
    playing: number,
    finished: number,
    levelsCleared: number,
    defeats: number,
  ): void {
    const cells: [string, string][] = [
      ['En la sala', String(total)],
      ['Jugando', String(playing)],
      ['Campañas completas', String(finished)],
      ['Operaciones superadas', String(levelsCleared)],
      ['Derrotas de la clase', String(defeats)],
    ];

    this.kpis.replaceChildren(
      ...cells.map(([label, value]) => {
        const cell = document.createElement('div');
        cell.className = 'admin-kpi';

        const strong = document.createElement('strong');
        strong.textContent = value;

        const small = document.createElement('span');
        small.textContent = label;

        cell.append(strong, small);
        return cell;
      }),
    );
  }

  private paintRows(rows: readonly RoomRow[]): void {
    if (rows.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'board-empty';
      empty.textContent = 'Todavía no ha entrado nadie a la sala.';
      this.rows.replaceChildren(empty);
      return;
    }

    this.rows.replaceChildren(
      ...rows.map((row) => {
        const li = document.createElement('li');
        li.classList.toggle('is-champion', row.finished);

        const position = document.createElement('span');
        position.className = 'admin-pos';
        position.textContent = String(row.position);

        const name = document.createElement('span');
        name.className = 'admin-name';
        name.textContent = row.name;

        // Las operaciones se muestran como tres casillas y no como "2/3": a
        // diez metros, una barra que se llena se lee de un vistazo y un
        // número pequeño no.
        const pips = document.createElement('span');
        pips.className = 'admin-pips';
        for (let level = 1; level <= TOTAL_LEVELS; level++) {
          const pip = document.createElement('i');
          pip.classList.toggle('is-done', level <= row.levelsDone);
          pips.append(pip);
        }

        const time = document.createElement('span');
        time.className = 'admin-time';
        time.textContent = row.levelsDone > 0 ? formatTime(row.seconds) : '—';

        const defeats = document.createElement('span');
        defeats.className = 'admin-defeats';
        defeats.textContent = row.defeats > 0 ? `${row.defeats} ✖` : '';

        li.append(position, name, pips, time, defeats);
        return li;
      }),
    );
  }

  /**
   * Reloj de la sala y aviso de caducidad.
   *
   * Los datos de la competencia viven una hora (`ROOM_TTL_MS`), así que la
   * cuenta atrás también es información útil para el profesor: le dice cuánto
   * le queda antes de que la tabla se vacíe sola.
   */
  private paintClock(): void {
    const startedAt = this.snapshot.startedAt;
    if (startedAt === null) {
      this.clock.textContent = '--:--';
      return;
    }
    const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
    const remaining = Math.max(0, ROOM_TTL_MS / 1000 - elapsed);
    this.clock.textContent = `${formatTime(elapsed)} · caduca en ${formatTime(remaining)}`;
  }
}
