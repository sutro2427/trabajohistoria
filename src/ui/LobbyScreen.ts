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
 * El botón "Jugar ahora" existe como salida de emergencia: si el wifi del
 * aula falla o alguien llega tarde, nadie se queda sin poder jugar.
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
  }

  private setError(message: string): void {
    this.error.textContent = message;
  }

  /** Refresca la lista de participantes con lo que llega de la sala. */
  render(snapshot: LobbySnapshot, online: boolean): void {
    if (!online) {
      this.status.textContent = 'Sin conexión con la sala: puedes jugar por tu cuenta.';
      this.roster.replaceChildren();
      this.soloButton.textContent = 'Empezar';
      return;
    }

    const ready = snapshot.participants.filter((p) => p.ready).length;
    const total = snapshot.participants.length;

    this.status.textContent =
      snapshot.state === 'running'
        ? '¡Salida dada! Empezando…'
        : `Esperando la salida del profesor · ${ready} de ${total} listos`;

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
