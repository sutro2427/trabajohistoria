import { checkName } from '../campaign/nameValidation.js';
import type { LobbySnapshot } from '../campaign/ICompetition.js';
import { requireElement } from './Hud.js';

/** Lo que la pantalla de acceso necesita comunicar hacia fuera. */
export interface LobbyHandlers {
  /** El alumno pide entrar con un nombre ya validado en el cliente. */
  onJoin(name: string): Promise<{ ok: boolean; reason?: string }>;
  /** El alumno quiere empezar sin esperar la salida del profesor. */
  onPlaySolo(): void;
}

/**
 * ============================================================================
 * PANTALLA DE ACCESO Y SALA DE ESPERA
 * ============================================================================
 *
 * Dos pasos:
 *
 *  1. **Identificarse.** El nombre se valida aquí mismo, con mensajes claros:
 *     el alumno tiene que saber por qué se le rechaza sin preguntar a nadie,
 *     porque esto ocurre con toda la clase entrando a la vez.
 *  2. **Esperar la salida.** Ve quién más está listo y espera a que el
 *     profesor dé la señal.
 *
 * **El botón de empezar solo aparece cuando el profesor da la salida.** Antes
 * estaba visible desde el primer momento como salida de emergencia, y eso
 * vaciaba la sala de espera de sentido: quien lo pulsaba empezaba solo, con lo
 * que la competencia dejaba de medir a todos bajo las mismas condiciones. Ahora
 * la emergencia sigue cubierta —si no hay red no hay salida que esperar y el
 * botón está desde el principio—, pero con la sala funcionando manda el
 * profesor.
 */
export class LobbyScreen {
  private readonly root: HTMLElement;
  private readonly joinStep: HTMLElement;
  private readonly waitStep: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly error: HTMLElement;
  private readonly joinButton: HTMLButtonElement;
  private readonly soloButton: HTMLButtonElement;
  private readonly nameLabel: HTMLElement;
  private readonly status: HTMLElement;
  private readonly roster: HTMLElement;

  private myName = '';
  private busy = false;

  /**
   * Último estado conocido de la sala.
   *
   * La sala cambia (entra gente, se da la salida) en momentos distintos de
   * cuando esta pantalla se muestra. Guardarlo permite pintar el estado real
   * en cuanto el alumno termina de identificarse, en vez de esperar al
   * siguiente cambio.
   */
  private lastSnapshot: LobbySnapshot = { state: 'lobby', startedAt: null, participants: [] };
  private lastOnline = false;

  constructor(private readonly handlers: LobbyHandlers) {
    this.root = requireElement('lobby-screen');
    this.joinStep = requireElement('lobby-join');
    this.waitStep = requireElement('lobby-wait');
    this.input = requireElement('player-name') as HTMLInputElement;
    this.error = requireElement('name-error');
    this.joinButton = requireElement('btn-join') as HTMLButtonElement;
    this.soloButton = requireElement('btn-solo') as HTMLButtonElement;
    this.nameLabel = requireElement('lobby-name');
    this.status = requireElement('lobby-status');
    this.roster = requireElement('roster');

    this.joinButton.addEventListener('click', () => void this.submit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.submit();
    });
    // El aviso se borra al escribir: dejarlo puesto mientras se corrige el
    // nombre da la impresión de que el error persiste.
    this.input.addEventListener('input', () => this.setError(''));
    this.soloButton.addEventListener('click', () => this.handlers.onPlaySolo());
  }

  show(): void {
    this.root.hidden = false;
    this.joinStep.hidden = false;
    this.waitStep.hidden = true;
    // El foco automático solo en escritorio: en móvil abriría el teclado de
    // golpe y taparía media pantalla nada más entrar.
    if (!matchMedia('(pointer: coarse)').matches) this.input.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  private async submit(): Promise<void> {
    if (this.busy) return;

    const check = checkName(this.input.value);
    if (!check.ok) {
      this.setError(check.message ?? 'Nombre no válido.');
      return;
    }

    this.busy = true;
    this.joinButton.disabled = true;
    this.joinButton.textContent = 'Entrando…';

    const result = await this.handlers.onJoin(check.value);

    this.busy = false;
    this.joinButton.disabled = false;
    this.joinButton.textContent = 'Entrar';

    if (!result.ok) {
      this.setError(result.reason ?? 'No se pudo entrar.');
      return;
    }

    this.myName = check.value;
    this.nameLabel.textContent = check.value;
    this.joinStep.hidden = true;
    this.waitStep.hidden = false;
    // Se repinta con lo último conocido: si la salida ya estaba dada (alguien
    // que llega tarde), tiene que ver el botón de empezar inmediatamente.
    this.render(this.lastSnapshot, this.lastOnline);
  }

  /**
   * Devuelve al alumno al paso de identificarse, con un aviso.
   *
   * Lo usa el juego cuando el profesor lo saca de la sala: sin esto, el alumno
   * se quedaría mirando una sala de espera en la que ya no está, sin entender
   * por qué su nombre desapareció de la lista.
   */
  kickedOut(): void {
    this.waitStep.hidden = true;
    this.joinStep.hidden = false;
    this.setError('El profesor te ha sacado de la sala. Vuelve a entrar con tu nombre real.');
    this.myName = '';
  }

  private setError(message: string): void {
    this.error.textContent = message;
  }

  /** Refresca la lista de participantes y el estado con lo que llega de la sala. */
  render(snapshot: LobbySnapshot, online: boolean): void {
    this.lastSnapshot = snapshot;
    this.lastOnline = online;

    if (!online) {
      // Sin sala compartida no hay salida que esperar: se puede empezar ya.
      this.status.textContent = 'Sin conexión con la sala: puedes jugar por tu cuenta.';
      this.roster.replaceChildren();
      this.soloButton.textContent = 'Empezar';
      this.soloButton.hidden = false;
      return;
    }

    const ready = snapshot.participants.filter((p) => p.ready).length;
    const total = snapshot.participants.length;
    const started = snapshot.state === 'running';

    // El botón de empezar es la señal de salida hecha visible. Aparece de golpe
    // y en grande cuando el profesor la da, y hasta entonces no existe.
    this.soloButton.hidden = !started;
    this.soloButton.textContent = '¡ADELANTE! EMPEZAR';
    this.soloButton.classList.toggle('btn-go', started);

    this.status.textContent = started
      ? '¡El profesor ha dado la salida! Pulsa para empezar.'
      : `Esperando la salida del profesor · ${ready} de ${total} en la sala`;

    this.roster.replaceChildren(
      ...[...snapshot.participants]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => {
          const li = document.createElement('li');
          li.textContent = p.name;
          li.classList.toggle('is-ready', p.ready);
          li.classList.toggle('is-you', p.name === this.myName);
          return li;
        }),
    );
  }
}
