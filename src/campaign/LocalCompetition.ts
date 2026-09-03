import type { ScoreEntry } from './CampaignRun.js';
import type {
  ICompetition,
  LobbySnapshot,
  LobbyState,
  Participant,
  Unsubscribe,
} from './ICompetition.js';
import { nameKey } from './nameValidation.js';

/**
 * Competencia sin red: un solo jugador, en su propio navegador.
 *
 * Es la red de seguridad de la presentación. Si Firebase no está configurado o
 * el aula se queda sin internet, el juego arranca igual con esta
 * implementación y el alumno puede jugar los tres niveles. Lo único que
 * desaparece es el panel compartido.
 *
 * Que exista esta clase es la razón por la que el resto del juego no importa
 * Firebase en ninguna parte.
 */
export class LocalCompetition implements ICompetition {
  readonly online = false;

  private state: LobbyState = 'lobby';
  private startedAt: number | null = null;
  private self: Participant | null = null;
  private readonly listeners = new Set<(s: LobbySnapshot) => void>();

  async join(name: string): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
    const id = nameKey(name);
    this.self = { id, name, ready: true, joinedAt: Date.now(), score: null };
    this.emit();
    return { ok: true, id };
  }

  async setReady(ready: boolean): Promise<void> {
    if (!this.self) return;
    this.self = { ...this.self, ready };
    this.emit();
  }

  async publish(score: ScoreEntry): Promise<void> {
    if (!this.self) return;
    this.self = { ...this.self, score };
    this.emit();
  }

  subscribe(onChange: (snapshot: LobbySnapshot) => void): Unsubscribe {
    this.listeners.add(onChange);
    onChange(this.snapshot());
    return () => {
      this.listeners.delete(onChange);
    };
  }

  async startCompetition(): Promise<void> {
    this.state = 'running';
    this.startedAt = Date.now();
    this.emit();
  }

  async resetCompetition(): Promise<void> {
    this.state = 'lobby';
    this.startedAt = null;
    if (this.self) this.self = { ...this.self, ready: false, score: null };
    this.emit();
  }

  dispose(): void {
    this.listeners.clear();
  }

  private snapshot(): LobbySnapshot {
    return {
      state: this.state,
      startedAt: this.startedAt,
      participants: this.self ? [this.self] : [],
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }
}
