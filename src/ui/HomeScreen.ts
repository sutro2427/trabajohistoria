import type { CampaignRun } from '../campaign/CampaignRun.js';
import { TOTAL_LEVELS } from '../domain/balance/levels.js';
import { fullscreenSupported, installHint, toggleFullscreen } from './fullscreen.js';
import { requireElement } from './Hud.js';

/** Lo que la portada necesita comunicar hacia fuera. */
export interface HomeHandlers {
  /** Empezar una campaña nueva: lleva a identificarse. */
  onPlay(): void;
  /** Retomar la campaña guardada por donde se dejó. */
  onContinue(run: CampaignRun): void;
  /** Descartar la campaña guardada y entrar con otro nombre. */
  onNewPlayer(): void;
  /** Ir al panel del profesor. */
  onAdmin(): void;
}

/**
 * ============================================================================
 * PORTADA
 * ============================================================================
 *
 * Lo primero que ve quien abre el enlace. Tiene una sola prioridad —que se
 * entienda en dos segundos qué es esto y dónde se pulsa para jugar— y por eso
 * la jerarquía es tan marcada: título, una línea de qué va, un botón enorme, y
 * todo lo demás pequeño y debajo.
 *
 * Las tres decisiones que no son evidentes:
 *
 *  · **"Continuar" solo aparece si hay algo que continuar**, y dice el nombre y
 *    la operación. Un botón que a veces no hace nada enseña al usuario a
 *    desconfiar de los botones.
 *  · **"Empezar de cero con otro nombre" es un botón aparte**, no una opción
 *    escondida. En clase el teléfono se pasa de mano en mano, y el segundo
 *    alumno no debe heredar la campaña del primero.
 *  · **La indicación de instalación solo sale donde hace falta.** En iPhone el
 *    botón de pantalla completa no puede funcionar —Safari no implementa la
 *    API—, así que ahí se explica la única vía que existe en lugar de dejar un
 *    botón mudo.
 */
export class HomeScreen {
  private readonly root: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly newButton: HTMLButtonElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly adminButton: HTMLButtonElement;
  private readonly install: HTMLElement;

  private savedRun: CampaignRun | null = null;

  constructor(private readonly handlers: HomeHandlers) {
    this.root = requireElement('home-screen');
    this.playButton = requireElement('home-play') as HTMLButtonElement;
    this.continueButton = requireElement('home-continue') as HTMLButtonElement;
    this.newButton = requireElement('home-new') as HTMLButtonElement;
    this.fullscreenButton = requireElement('home-fullscreen') as HTMLButtonElement;
    this.adminButton = requireElement('home-admin') as HTMLButtonElement;
    this.install = requireElement('home-install');

    this.playButton.addEventListener('click', () => {
      this.hide();
      this.handlers.onPlay();
    });

    this.continueButton.addEventListener('click', () => {
      const run = this.savedRun;
      if (!run) return;
      this.hide();
      this.handlers.onContinue(run);
    });

    this.newButton.addEventListener('click', () => {
      this.hide();
      this.handlers.onNewPlayer();
    });

    this.fullscreenButton.addEventListener('click', () => void toggleFullscreen());
    this.adminButton.addEventListener('click', () => this.handlers.onAdmin());

    // Donde no hay API de pantalla completa el botón no puede hacer nada; se
    // retira y la indicación de abajo ocupa su función.
    this.fullscreenButton.hidden = !fullscreenSupported();
  }

  /** Muestra la portada, con o sin campaña que retomar. */
  show(savedRun: CampaignRun | null): void {
    this.savedRun = savedRun;

    if (savedRun) {
      const operation = Math.min(savedRun.currentLevel, TOTAL_LEVELS);
      this.continueButton.textContent = `Continuar — ${savedRun.playerName}, operación ${operation}`;
      this.continueButton.hidden = false;
      this.newButton.hidden = false;
      // Con una campaña a medias, retomarla es lo más probable: manda ella.
      this.continueButton.classList.add('btn-primary');
      this.playButton.classList.remove('btn-primary');
      this.playButton.textContent = 'Empezar una campaña nueva';
    } else {
      this.continueButton.hidden = true;
      this.newButton.hidden = true;
      this.continueButton.classList.remove('btn-primary');
      this.playButton.classList.add('btn-primary');
      this.playButton.textContent = 'JUGAR';
    }

    const hint = installHint();
    this.install.textContent = hint;
    this.install.hidden = hint === '';

    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }
}
