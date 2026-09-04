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
  private readonly fullscreenLabel: HTMLElement;
  private readonly adminButton: HTMLButtonElement;
  private readonly install: HTMLElement;

  private savedRun: CampaignRun | null = null;

  constructor(private readonly handlers: HomeHandlers) {
    this.root = requireElement('home-screen');
    this.playButton = requireElement('home-play') as HTMLButtonElement;
    this.continueButton = requireElement('home-continue') as HTMLButtonElement;
    this.newButton = requireElement('home-new') as HTMLButtonElement;
    this.fullscreenButton = requireElement('home-fullscreen') as HTMLButtonElement;
    this.fullscreenLabel = requireElement('home-fullscreen-label');
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

    this.fullscreenButton.addEventListener('click', () => this.expand());
    this.adminButton.addEventListener('click', () => this.handlers.onAdmin());
  }

  /**
   * Agranda la pantalla, o enseña cómo hacerlo donde el navegador no deja.
   *
   * El botón **nunca se oculta**, ni siquiera en iPhone, donde no existe la
   * API. Ocultarlo era lo que había antes y era peor: quien más lo necesitaba
   * era justo quien no lo veía, y no tenía forma de enterarse de que la vía
   * era instalar la página. Un botón que explica qué hacer sirve; uno ausente
   * no sirve para nada.
   */
  private expand(): void {
    if (fullscreenSupported()) {
      void toggleFullscreen();
      return;
    }
    // Sin API el botón despliega las instrucciones y las subraya. En una
    // pantalla baja el cartel viene plegado y esto es lo que lo abre; en una
    // alta ya está a la vista y el parpadeo señala dónde mirar.
    this.install.classList.add('is-open');
    this.install.classList.remove('is-calling');
    // Reiniciar la animación exige un reflujo entre quitar y poner la clase.
    void this.install.offsetWidth;
    this.install.classList.add('is-calling');
    this.install.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

    this.paintInstallHint();
    this.root.hidden = false;
  }

  /**
   * Pinta el cartel de "cómo agrandar", o lo retira si no hace falta.
   *
   * Es un cartel y no una línea de texto pequeño a propósito: agrandar es lo
   * primero que va a hacer todo el mundo, y en una clase de treinta personas
   * no puede depender de que alguien encuentre una nota al pie.
   */
  private paintInstallHint(): void {
    const hint = installHint();

    if (!hint) {
      this.install.hidden = true;
      this.fullscreenLabel.textContent = 'Agrandar pantalla';
      return;
    }

    // Donde el botón no puede actuar, dice lo que sí va a hacer: enseñar cómo.
    this.fullscreenLabel.textContent = fullscreenSupported()
      ? 'Agrandar pantalla'
      : 'Cómo agrandar la pantalla';

    const title = document.createElement('b');
    title.className = 'install-title';
    title.textContent = hint.title;

    const steps = document.createElement('ol');
    steps.className = 'install-steps';
    for (const step of hint.steps) {
      const li = document.createElement('li');
      li.textContent = step;
      steps.append(li);
    }

    const reward = document.createElement('span');
    reward.className = 'install-reward';
    reward.textContent = hint.reward;

    this.install.replaceChildren(title, steps, reward);
    this.install.classList.remove('is-open', 'is-calling');
    this.install.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }
}
