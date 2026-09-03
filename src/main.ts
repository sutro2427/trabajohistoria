import './ui/ui.css';
import { Game } from './app/Game.js';
import { installDebugBridge } from './app/DebugBridge.js';
import { LocalStorageProgressRepository } from './persistence/LocalStorageProgressRepository.js';

/**
 * Punto de entrada.
 *
 * Lee la configuración de la URL, construye el juego y lo arranca. Es
 * deliberadamente corto: toda la composición vive en `app/Game.ts`, y toda la
 * lógica en `domain/`.
 *
 * Parámetros de URL admitidos:
 *   ?seed=123    fija la semilla (reproduce una partida exacta)
 *   ?speed=8     acelera la simulación (tests y depuración)
 *   ?debug=1     expone `window.__GAME_DEBUG__`
 */
function bootstrap(): void {
  const canvas = document.getElementById('screen');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Falta el elemento <canvas id="screen"> en index.html');
  }

  const params = new URLSearchParams(window.location.search);
  const seed = params.has('seed') ? Number(params.get('seed')) : undefined;
  const timeScale = params.has('speed') ? Number(params.get('speed')) : undefined;
  const debug = params.get('debug') === '1' || import.meta.env.DEV;

  const game = new Game(canvas, new LocalStorageProgressRepository(), {
    // Se descartan los valores no numéricos de la URL en lugar de propagar
    // un NaN, que rompería la simulación de forma silenciosa.
    ...(seed !== undefined && Number.isFinite(seed) ? { seed } : {}),
    ...(timeScale !== undefined && Number.isFinite(timeScale) ? { timeScale } : {}),
  });

  if (debug) installDebugBridge(game);

  game.start();
}

bootstrap();
