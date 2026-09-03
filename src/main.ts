import './ui/ui.css';
import { Game } from './app/Game.js';
import { installDebugBridge } from './app/DebugBridge.js';
import { LocalStorageProgressRepository } from './persistence/LocalStorageProgressRepository.js';
import type { ICompetition } from './campaign/ICompetition.js';
import { LocalCompetition } from './campaign/LocalCompetition.js';
import { readAdminKey, readFirebaseSettings, readRoomId } from './campaign/firebaseConfig.js';

/**
 * Punto de entrada.
 *
 * Parámetros de URL:
 *   ?sala=1a       sala de competencia (permite un enlace por curso)
 *   ?admin=<clave> muestra los controles del profesor
 *   ?seed=123      fija la semilla, para reproducir una partida exacta
 *   ?speed=8       acelera la simulación (pruebas y depuración)
 *   ?debug=1       expone `window.__GAME_DEBUG__`
 */

/**
 * Elige la implementación de competencia.
 *
 * Con Firebase configurado se juega en red; sin configuración, o si el SDK
 * falla al inicializarse, se cae al modo local. Esa caída es deliberada: en
 * una presentación en clase, quedarse sin panel compartido es un contratiempo,
 * pero quedarse sin juego sería un desastre.
 */
async function createCompetition(): Promise<ICompetition> {
  const settings = readFirebaseSettings();
  if (!settings) return new LocalCompetition();

  try {
    // Carga diferida: el SDK de Firebase pesa, y quien juega en modo local no
    // debería descargarlo para nada.
    const { FirebaseCompetition } = await import('./campaign/FirebaseCompetition.js');
    return new FirebaseCompetition(settings, readRoomId());
  } catch (error) {
    console.warn('Competencia en red no disponible, se juega en local:', error);
    return new LocalCompetition();
  }
}

/**
 * Pide pantalla completa en el primer gesto del usuario.
 *
 * En Android la barra de direcciones se come un tercio de la altura útil en
 * horizontal. Debe hacerse dentro de un gesto real o el navegador lo rechaza,
 * y falla en silencio en iOS, donde la API no existe para el elemento.
 */
function requestFullscreenOnFirstTouch(): void {
  const tryFullscreen = (): void => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        // Rechazado por el navegador: no es un error del juego.
      });
    }
    window.removeEventListener('pointerdown', tryFullscreen);
  };
  // Solo en dispositivos táctiles: en escritorio, forzar pantalla completa al
  // primer clic sería una grosería.
  if (matchMedia('(pointer: coarse)').matches) {
    window.addEventListener('pointerdown', tryFullscreen, { once: false });
  }
}

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('screen');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Falta el elemento <canvas id="screen"> en index.html');
  }

  const params = new URLSearchParams(window.location.search);
  const seed = params.has('seed') ? Number(params.get('seed')) : undefined;
  const timeScale = params.has('speed') ? Number(params.get('speed')) : undefined;
  const debug = params.get('debug') === '1' || import.meta.env.DEV;

  // La clave del profesor se compara con la configurada en el despliegue. Es
  // una barrera de conveniencia, no de seguridad: lo que de verdad impide que
  // un alumno manipule la sala son las reglas de Firestore.
  const expectedAdminKey = import.meta.env['VITE_ADMIN_KEY'];
  const admin = Boolean(expectedAdminKey) && readAdminKey() === expectedAdminKey;

  const competition = await createCompetition();

  const game = new Game(canvas, new LocalStorageProgressRepository(), competition, {
    // Se descartan los valores no numéricos en lugar de propagar un NaN, que
    // rompería la simulación de forma silenciosa.
    ...(seed !== undefined && Number.isFinite(seed) ? { seed } : {}),
    ...(timeScale !== undefined && Number.isFinite(timeScale) ? { timeScale } : {}),
    admin,
  });

  if (debug) installDebugBridge(game);

  requestFullscreenOnFirstTouch();
  game.start();
}

void bootstrap();
