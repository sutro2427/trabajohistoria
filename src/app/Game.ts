import { bakeArt } from '../art/SpriteBaker.js';
import { GameLoop } from '../core/GameLoop.js';
import { getUnitDef, WORLD } from '../domain/balance/balance.js';
import { getLevel, TOTAL_LEVELS } from '../domain/balance/levels.js';
import { GameSession } from '../domain/GameSession.js';
import type { Stance } from '../domain/balance/types.js';
import { InputManager } from '../input/InputManager.js';
import type { IProgressRepository } from '../persistence/IProgressRepository.js';
import { Camera } from '../render/Camera.js';
import { FxSystem } from '../render/FxSystem.js';
import { Renderer } from '../render/Renderer.js';
import { SpriteAtlas } from '../render/SpriteAtlas.js';
import { ViewportManager } from '../render/Viewport.js';
import { CommandBar } from '../ui/CommandBar.js';
import { Hud, requireElement } from '../ui/Hud.js';
import { LobbyScreen } from '../ui/LobbyScreen.js';
import { FullscreenButton } from '../ui/FullscreenButton.js';
import { ResultOverlay } from '../ui/ResultOverlay.js';
import { ScoreBoard } from '../ui/ScoreBoard.js';
import { AdminPanel } from '../ui/AdminPanel.js';
import { HomeScreen } from '../ui/HomeScreen.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import type { ICompetition, LobbySnapshot } from '../campaign/ICompetition.js';
import {
  createRun,
  isComplete,
  recordDefeat,
  recordVictory,
  summarize,
  toScoreEntry,
  type CampaignRun,
} from '../campaign/CampaignRun.js';

/**
 * ============================================================================
 * RAÍZ DE COMPOSICIÓN de la aplicación
 * ============================================================================
 *
 * Une cuatro mundos que no se conocen entre sí: la simulación (sin DOM), el
 * render, la interfaz y la competencia en red. Es el único punto del proyecto
 * que sabe que existen a la vez.
 *
 * Ciclo de vida completo:
 *
 *   ACCESO ─nombre─► SALA ─salida─► OPERACIÓN 1 ─► 2 ─► 3 ─► CAMPAÑA COMPLETA
 *                                        │                        │
 *                                    derrota                 tabla de
 *                                        └──repetir            posiciones
 *
 * Detrás de cada pantalla corre el campo de batalla real, sin simular: el
 * fondo del menú es el propio juego, así que no hay una segunda escena que
 * mantener.
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly atlas: SpriteAtlas;
  private readonly camera: Camera;
  private readonly loop: GameLoop;
  private readonly overlay = new ResultOverlay();
  private readonly lobby: LobbyScreen;
  private readonly home: HomeScreen;
  private readonly pauseMenu: PauseMenu;
  private readonly board: ScoreBoard;
  private readonly input: InputManager;
  private readonly viewport: ViewportManager;
  /** Raíz de la aplicación; lleva la clase que retira el HUD fuera del combate. */
  private readonly appRoot = document.getElementById('app');
  /** Botones de acercar y alejar; solo se ven durante el combate. */
  private readonly zoomControls: HTMLElement;
  /**
   * Panel del profesor. Solo existe si se entró con `?admin`: en la página de
   * un alumno ni siquiera se construye, así que no hay nada que abrir desde la
   * consola del navegador.
   */
  private readonly admin: AdminPanel | null = null;

  private session!: GameSession;
  private renderer!: Renderer;
  private fx!: FxSystem;
  private hud!: Hud;
  private commandBar!: CommandBar;

  /** Intento de campaña en curso; `null` hasta que el alumno se identifica. */
  private run: CampaignRun | null = null;
  private levelId = 1;

  private seed: number;
  private readonly fixedSeed: number | undefined;

  /** `true` mientras el jugador puede dar órdenes. */
  private interactive = false;
  /** Segundos en pantalla de espera, o `null` durante la partida. */
  private menuTime: number | null = 0;
  /** Último estado conocido de la sala. */
  private snapshot: LobbySnapshot = { state: 'lobby', startedAt: null, participants: [] };
  /** Evita arrancar dos veces si la salida llega mientras ya se está jugando. */
  private started = false;
  /**
   * `true` en cuanto este alumno aparece en la lista de la sala.
   *
   * Es lo que distingue "todavía no ha llegado mi entrada" de "el profesor me
   * ha sacado": los dos casos se ven igual en la instantánea.
   */
  private seenInRoom = false;
  /**
   * `true` con el menú de pausa abierto.
   *
   * Es distinto de `interactive`: ese también está en `false` durante los
   * informes previos y las pantallas de resultado, y de ahí NO se vuelve
   * pulsando "seguir jugando". Separarlos evita que el menú de pausa pueda
   * reanudar una partida que ni siquiera había empezado.
   */
  private paused = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly progressRepo: IProgressRepository,
    private readonly competition: ICompetition,
    options: { seed?: number; timeScale?: number; admin?: boolean; roomId?: string } = {},
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.fixedSeed = options.seed;
    this.seed = options.seed ?? Math.floor(Math.random() * 1_000_000);

    // El área lógica se adapta a la pantalla: en un teléfono alargado se ve
    // más campo de batalla en vez de dejar barras negras a los lados.
    this.viewport = new ViewportManager(canvas, (size) => this.onViewportChange(size));
    this.camera = new Camera(this.viewport.size.width);

    // El arte se hornea una sola vez y sirve para toda la campaña.
    this.atlas = new SpriteAtlas(bakeArt());

    // Se guarda la referencia: la versión anterior descartaba el objeto y por
    // eso el desplazamiento de cámara con el teclado nunca llegaba a ejecutarse.
    this.input = new InputManager(canvas, this.camera, this.viewport.size.width);

    new FullscreenButton();
    this.zoomControls = requireElement('zoom-controls');
    (requireElement('btn-zoom-in') as HTMLButtonElement).addEventListener('click', () =>
      this.input.zoomBy(0.5),
    );
    (requireElement('btn-zoom-out') as HTMLButtonElement).addEventListener('click', () =>
      this.input.zoomBy(-0.5),
    );

    this.board = new ScoreBoard();
    this.lobby = new LobbyScreen({
      onJoin: (name) => this.joinCompetition(name),
      onPlaySolo: () => this.beginCampaign(),
    });

    this.home = new HomeScreen({
      onPlay: () => this.lobby.show(),
      onContinue: (run) => this.resumeCampaign(run),
      onNewPlayer: () => this.forgetSavedRun(),
      onAdmin: () => this.openAdminPanel(),
    });

    this.pauseMenu = new PauseMenu({
      onResume: () => this.resumeBattle(),
      onRetry: () => this.retryLevel(),
      onExit: () => this.exitToHome(),
    });
    this.pauseMenu.requestOpen = () => this.pauseBattle();

    if (options.admin) {
      // Los mismos dos controles siguen estando en la tabla de posiciones: el
      // profesor puede dar la salida desde el panel proyectado o desde su
      // propia partida, sin tener que elegir dónde se sienta.
      this.board.enableAdmin(
        () => void this.competition.startCompetition(),
        () => void this.competition.resetCompetition(),
      );

      this.admin = new AdminPanel(
        {
          onStart: () => void this.competition.startCompetition(),
          onReset: () => void this.competition.resetCompetition(),
          onRemove: (id) => void this.competition.removeParticipant(id),
        },
        options.roomId ?? 'clase',
        this.competition.online,
        this.competition.offlineReason,
      );
    }

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha) => this.render(alpha),
    });
    if (options.timeScale) this.loop.setTimeScale(options.timeScale);
  }

  /**
   * Reacciona a un cambio de tamaño o de orientación.
   *
   * Los tres consumidores del ancho lógico tienen que enterarse a la vez: la
   * cámara (para no dejar ver el vacío del final del mapa), la entrada (para
   * convertir bien el arrastre) y la barra de mando (para que el bombardeo
   * caiga donde el jugador tocó).
   */
  private onViewportChange(size: { width: number; height: number }): void {
    this.camera.setViewWidth(size.width);
    this.input.setLogicalWidth(size.width);
    // Girar el teléfono o entrar en pantalla completa cambia el ancho lógico, y
    // con él cuánto mundo cabe: se recalcula el aumento para seguir enseñando
    // el mismo trozo de campo en lugar de encogerlo todo de golpe.
    this.camera.resetZoom();
  }

  /** Arranca la aplicación en la pantalla de acceso. */
  start(): void {
    this.levelId = 1;
    this.setMenuMode(true);
    this.buildSession();
    this.loop.start();

    this.competition.subscribe((snapshot) => this.onLobbyChange(snapshot));

    // El profesor no entra a jugar: su pantalla es el cuadro de mando. Si no
    // es una sesión de administrador, se abre la portada.
    if (this.admin) this.admin.open();
    else this.home.show(this.progressRepo.load().savedRun);
  }

  // -------------------------------------------------------------------------
  // Portada
  // -------------------------------------------------------------------------

  /**
   * Retoma una campaña guardada por la operación donde se dejó.
   *
   * No se vuelve a entrar en la sala: el alumno ya se identificó en su
   * momento, y volver a pedirle el nombre sería pedirle que demuestre otra vez
   * quién es. Sí se vuelve a publicar su progreso, para que reaparezca en la
   * tabla si la sala se reinició mientras estaba fuera.
   */
  private resumeCampaign(run: CampaignRun): void {
    this.run = run;
    this.board.setPlayerName(run.playerName);
    void this.competition.publish(toScoreEntry(run));

    this.started = true;
    this.levelId = Math.min(TOTAL_LEVELS, Math.max(1, run.currentLevel));
    this.board.setToggleVisible(true);
    this.showBriefing();
  }

  /**
   * Descarta la campaña guardada y vuelve a pedir nombre.
   *
   * En clase el teléfono se pasa de mano en mano: sin esto, el segundo alumno
   * heredaría el intento del primero y la tabla registraría sus operaciones a
   * nombre ajeno.
   */
  private forgetSavedRun(): void {
    this.saveRun(null);
    this.run = null;
    this.lobby.show();
  }

  /** Abre el panel del profesor recargando en modo administrador. */
  private openAdminPanel(): void {
    const url = new URL(window.location.href);
    url.searchParams.set('admin', '');
    // `set('admin','')` deja "?admin=" y la puerta lo trata como sin clave:
    // pedirá la contraseña, que es justo lo que se quiere desde la portada.
    window.location.href = url.toString();
  }

  /** Guarda (o borra) el intento en curso para poder retomarlo. */
  private saveRun(run: CampaignRun | null): void {
    const progress = this.progressRepo.load();
    progress.savedRun = run;
    this.progressRepo.save(progress);
  }

  // -------------------------------------------------------------------------
  // Pausa
  // -------------------------------------------------------------------------

  /** `true` si hay una operación en curso que se pueda pausar. */
  private inBattle(): boolean {
    return this.started && this.menuTime === null && !this.session.world.finished;
  }

  private pauseBattle(): void {
    if (!this.inBattle() || this.paused) return;
    this.paused = true;
    this.interactive = false;
    this.pauseMenu.show(this.session.level, this.session.world.elapsed);
  }

  private resumeBattle(): void {
    if (!this.paused) return;
    this.paused = false;
    this.interactive = true;
    this.pauseMenu.hide();
  }

  private retryLevel(): void {
    this.paused = false;
    this.pauseMenu.hide();
    this.beginBattle();
  }

  /**
   * Sale al menú conservando lo conseguido.
   *
   * La operación en curso se pierde —se estaba jugando— pero las ya superadas
   * no: se guarda el intento y al volver se retoma por la operación en la que
   * estaba. Perder tres minutos por atender una pregunta en clase sería un
   * castigo absurdo.
   */
  private exitToHome(): void {
    this.paused = false;
    this.interactive = false;
    this.started = false;
    this.menuTime = 0;

    if (this.run && !isComplete(this.run)) this.saveRun(this.run);

    this.pauseMenu.hide();
    this.pauseMenu.setToggleVisible(false);
    this.zoomControls.hidden = true;
    this.board.setToggleVisible(false);
    this.overlay.hide();
    this.setMenuMode(true);
    this.home.show(this.progressRepo.load().savedRun);
  }

  /** Entra o sale del modo menú, que retira el HUD y la barra de mando. */
  private setMenuMode(active: boolean): void {
    this.appRoot?.classList.toggle('is-menu', active);
  }

  // -------------------------------------------------------------------------
  // Competencia
  // -------------------------------------------------------------------------

  private async joinCompetition(name: string): Promise<{ ok: boolean; reason?: string }> {
    const result = await this.competition.join(name);
    if (!result.ok) return { ok: false, reason: result.reason };

    this.run = createRun(name);
    this.board.setPlayerName(name);
    await this.competition.setReady(true);
    // Se publica de inmediato para que el alumno se vea en la tabla desde el
    // primer momento, aunque todavía no haya jugado nada.
    await this.competition.publish(toScoreEntry(this.run));
    return { ok: true };
  }

  /** Reacciona a los cambios de la sala: entradas, salidas y la señal de inicio. */
  private onLobbyChange(snapshot: LobbySnapshot): void {
    this.snapshot = snapshot;
    this.lobby.render(snapshot, this.competition.online, this.competition.offlineReason);
    this.checkIfRemoved(snapshot);
    // El panel se refresca SIEMPRE, no solo si está abierto: pintar unas
    // pocas filas de DOM es gratis, y así al pulsar el botón ya está al día.
    // Condicionarlo a que fuera visible dejaba el panel vacío la primera vez.
    this.board.render(snapshot, this.competition.online);
    this.admin?.render(snapshot);

    // La salida del profesor NO arranca la partida sola: hace aparecer el botón
    // de empezar en la sala de espera (ver `LobbyScreen.render`). Es la
    // diferencia entre que a alguien le arranque la campaña mientras mira otra
    // cosa y que empiece cuando tiene el teléfono en la mano.
  }

  /**
   * Detecta que el profesor ha sacado a este alumno de la sala.
   *
   * Se comprueba por nombre y solo mientras espera: una vez jugando, una caída
   * momentánea de red que vaciara la lista no debe echarle de su propia
   * partida.
   */
  private checkIfRemoved(snapshot: LobbySnapshot): void {
    if (!this.competition.online || this.started || this.run === null) return;
    if (!this.lobby.visible) return;

    const stillIn = snapshot.participants.some((p) => p.name === this.run?.playerName);
    if (stillIn) {
      this.seenInRoom = true;
      return;
    }

    // Solo se considera expulsión si antes SE LE VIO en la sala. Entre que se
    // envía la entrada y llega el cambio de vuelta hay un instante en el que
    // el alumno todavía no figura, y sin esta condición se echaría a sí mismo
    // nada más entrar.
    if (!this.seenInRoom) return;

    this.seenInRoom = false;
    this.run = null;
    this.saveRun(null);
    this.lobby.kickedOut();
  }

  /** Empieza la campaña por el nivel 1. */
  private beginCampaign(): void {
    if (this.started) return;
    this.started = true;

    // Quien pulsa "Jugar ahora" sin haberse identificado juega igualmente: en
    // clase es peor que alguien se quede fuera que un jugador anónimo de más.
    this.run ??= createRun('Invitado');

    this.lobby.hide();
    this.board.setToggleVisible(true);
    this.levelId = 1;
    this.saveRun(this.run);
    this.showBriefing();
  }

  // -------------------------------------------------------------------------
  // Ciclo de la campaña
  // -------------------------------------------------------------------------

  /** Informe previo a la operación: explica lo que el nivel introduce. */
  private showBriefing(): void {
    this.interactive = false;
    this.menuTime = 0;
    this.buildSession();
    this.overlay.show(ResultOverlay.briefing(getLevel(this.levelId)), () => this.beginBattle());
  }

  /** Construye una partida nueva y cablea la interfaz con ella. */
  private buildSession(): void {
    const progress = this.progressRepo.load();
    this.session = new GameSession(
      this.levelId,
      this.seed,
      // Los planos del tanque se desbloquean al llegar al nivel que los usa.
      this.levelId >= 3 || progress.tankBlueprintUnlocked,
      this.levelId > 1 ? progress.loot : 0,
    );

    const bus = this.session.world.bus;
    this.fx = new FxSystem(bus, this.camera);
    this.renderer = new Renderer(this.ctx, this.atlas, this.camera, this.fx, getUnitDef);

    this.hud = new Hud(bus);

    // La barra anterior se destruye: se suscribe al bus y al teclado, y sin
    // soltar esos oyentes se acumularían nivel tras nivel.
    this.commandBar?.destroy();
    this.commandBar = new CommandBar(
      bus,
      {
        onTrain: (defId) => {
          if (this.interactive) this.session.trainUnit(defId);
        },
        onStance: (stance: Stance) => {
          if (this.interactive) this.session.setStance(stance);
        },
        onLaunchPower: (powerId, worldX) => {
          if (this.interactive) this.session.launchPower(powerId, worldX);
        },
      },
    );
    this.commandBar.buildFor(this.session.buildable, this.session.powers);

    const team = this.session.world.teams.US;
    this.hud.reset(team.supplies, team.population, team.populationMax, this.session.level.objective);
    this.commandBar.highlightStance('defend');

    bus.on('level:ended', (payload) => this.onLevelEnded(payload));

    // Cada operación empieza con el aumento propio de esta pantalla: el que el
    // jugador haya elegido a mano es una preferencia del momento, no un ajuste
    // que deba arrastrarse de un nivel al siguiente sin que se dé cuenta.
    this.camera.resetZoom();
    this.camera.snapTo(WORLD.usBaseX + 60);
    this.fx.clear();
    this.interactive = false;
  }

  private beginBattle(): void {
    this.seed = this.fixedSeed ?? Math.floor(Math.random() * 1_000_000);
    this.buildSession();
    this.menuTime = null;
    this.paused = false;
    this.interactive = true;
    this.setMenuMode(false);
    // El botón de pausa solo existe mientras hay algo que pausar: enseñarlo en
    // un informe previo invitaría a pulsarlo para nada.
    this.pauseMenu.setToggleVisible(true);
    this.zoomControls.hidden = false;
  }

  /** Cierra el nivel: registra el resultado, publica y decide qué viene después. */
  private onLevelEnded({ won, loot, elapsed }: { won: boolean; loot: number; elapsed: number }): void {
    this.interactive = false;
    this.paused = false;
    this.pauseMenu.setToggleVisible(false);
    this.zoomControls.hidden = true;
    const world = this.session.world;
    const level = this.session.level;
    const team = world.teams.US;
    const run = this.run;

    if (!won) {
      if (run) {
        recordDefeat(run);
        this.saveRun(run);
        void this.competition.publish(toScoreEntry(run));
      }
      const reason = world.structureOf('US')
        ? 'Tu fuerza ha quedado aniquilada y no queda con qué reponerla.\n' +
          'La economía sostiene al ejército, pero sin ejército no hay economía que defender.'
        : 'La base de fuego ha caído. La posición se ha perdido.';
      // Se repite el mismo nivel: la campaña no retrocede.
      this.overlay.show(ResultOverlay.defeat(level, elapsed, reason), () => this.beginBattle());
      return;
    }

    // --- Nivel superado ---
    const progress = this.progressRepo.load();
    progress.victories++;
    progress.loot = loot;
    progress.tankBlueprintUnlocked = true;
    progress.unlockedLevel = Math.max(progress.unlockedLevel, this.levelId + 1);
    const best = progress.bestTimeSec[String(this.levelId)];
    if (best === undefined || elapsed < best) progress.bestTimeSec[String(this.levelId)] = elapsed;
    this.progressRepo.save(progress);

    if (run) {
      recordVictory(run, {
        level: this.levelId,
        seconds: Math.round(elapsed),
        harvested: Math.round(team.harvested),
        leftover: Math.round(team.supplies),
        losses: world.teams.VC.kills,
        kills: team.kills,
        spentOnPowers: Math.round(team.spentOnPowers),
      });
      this.saveRun(isComplete(run) ? null : run);
      void this.competition.publish(toScoreEntry(run));
    }

    if (run && isComplete(run)) {
      this.onCampaignComplete(run);
      return;
    }

    this.overlay.show(
      ResultOverlay.levelCleared(level, elapsed, team.kills),
      () => {
        this.levelId = Math.min(TOTAL_LEVELS, this.levelId + 1);
        this.showBriefing();
      },
      () => this.board.show(),
    );
  }

  /** Cierre de la campaña: el mensaje del juego, con las cifras del alumno. */
  private onCampaignComplete(run: CampaignRun): void {
    this.menuTime = 0;
    this.board.render(this.snapshot, this.competition.online);

    this.overlay.show(
      ResultOverlay.campaignComplete(summarize(run), run.playerName),
      () => this.board.show(),
      () => {
        // Volver a intentarlo: se conserva el nombre y el histórico de la sala,
        // pero la campaña empieza de cero.
        this.run = createRun(run.playerName);
        this.saveRun(this.run);
        this.levelId = 1;
        this.showBriefing();
      },
    );
  }

  // -------------------------------------------------------------------------
  // Bucle
  // -------------------------------------------------------------------------

  private fixedUpdate(dt: number): void {
    if (this.interactive) this.session.step(dt);
    this.input.update(dt);
    this.fx.update(dt);
    this.hud.update(dt, this.session.world.elapsed, this.session.level.timeLimitSec);

    const team = this.session.world.teams.US;
    this.commandBar.update(dt, {
      supplies: team.supplies,
      queue: team.queue[0],
      interactive: this.interactive,
      powerCooldowns: new Map(team.powers.map((p) => [p.defId, p.cooldown])),
      cameraX: this.camera.x,
      viewWidth: this.camera.width,
    });

    if (this.menuTime !== null) {
      // Fuera de la partida la cámara pasea despacio por el valle. Se coloca de
      // forma directa y no con `pan`, que activaría el control manual y dejaría
      // la cámara clavada al empezar el nivel.
      this.menuTime += dt;
      this.camera.snapTo(WORLD.usBaseX + 150 + Math.sin(this.menuTime * 0.12) * 120);
    } else {
      this.camera.update(dt, this.focusPoint());
    }
  }

  /**
   * Centro de interés de la cámara: el punto medio entre la unidad aliada más
   * avanzada y la enemiga más avanzada, siempre que estén en contacto.
   */
  private focusPoint(): number {
    const world = this.session.world;
    let friendlyFront: number = WORLD.usBaseX;
    let enemyFront = Infinity;

    for (const unit of world.units) {
      if (!unit.alive) continue;
      if (unit.team === 'US') {
        // Los recolectores trabajan en retaguardia: si contaran, la cámara se
        // quedaría mirando los depósitos en lugar de la batalla.
        if (unit.defId === 'us_harvester') continue;
        friendlyFront = Math.max(friendlyFront, unit.transform.x);
      } else {
        enemyFront = Math.min(enemyFront, unit.transform.x);
      }
    }

    const ownFocus = friendlyFront + 70;
    // Con el enemigo lejos, el punto medio caería en mitad de la selva vacía.
    const CONTACT_RANGE = 260;
    if (enemyFront - friendlyFront > CONTACT_RANGE) return ownFocus;
    return (friendlyFront + enemyFront) * 0.5;
  }

  private render(alpha: number): void {
    this.renderer.render(this.session.world, this.interactive ? alpha : 0);
  }

  // -------------------------------------------------------------------------
  // Acceso controlado para el puente de depuración y los tests
  // -------------------------------------------------------------------------

  getSession(): GameSession {
    return this.session;
  }

  isInteractive(): boolean {
    return this.interactive;
  }

  getLevelId(): number {
    return this.levelId;
  }

  getRun(): CampaignRun | null {
    return this.run;
  }

  setTimeScale(scale: number): void {
    this.loop.setTimeScale(scale);
  }

  /** Fija el aumento de la cámara. Lo usan las pruebas automatizadas. */
  setZoom(zoom: number): void {
    this.camera.setZoom(zoom);
  }

  getFps(): number {
    return this.loop.getFps();
  }

  /** Salta el acceso y el informe. Lo usan los tests automatizados. */
  skipToBattle(name = 'Prueba Automatizada'): void {
    if (!this.run) {
      this.run = createRun(name);
      this.board.setPlayerName(name);
    }
    this.home.hide();
    this.lobby.hide();
    this.overlay.hide();
    this.started = true;
    this.board.setToggleVisible(true);
    this.beginBattle();
  }

  /** Salta directamente a un nivel concreto. Solo para pruebas. */
  jumpToLevel(levelId: number): void {
    this.levelId = Math.min(TOTAL_LEVELS, Math.max(1, levelId));
    this.skipToBattle();
  }
}
