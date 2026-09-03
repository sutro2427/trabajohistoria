import type { Stance } from '../domain/balance/types.js';
import type { Game } from './Game.js';

/**
 * Puente de depuración: expone el estado de la partida en `window`.
 *
 * Sirve para dos cosas concretas:
 *
 *  1. Que los tests automatizados puedan leer el estado y dar órdenes sin
 *     depender de píxeles ni de coordenadas del canvas.
 *  2. Acelerar el tiempo para jugar un nivel entero en segundos.
 *
 * Se activa solo en desarrollo o con `?debug=1`: en una build de producción
 * normal no existe.
 */

/** Instantánea del estado, pensada para leerse desde un test. */
export interface DebugState {
  supplies: number;
  population: number;
  populationMax: number;
  stance: Stance;
  elapsed: number;
  fps: number;
  interactive: boolean;
  units: { id: number; defId: string; team: string; x: number; hp: number; state: string }[];
  enemyStructureHp: number;
  playerStructureHp: number;
  ended: { won: boolean; loot: number } | null;
}

/** Órdenes que un test puede emitir, con los mismos nombres que los botones. */
export type DebugCommand =
  | 'buy_soldier'
  | 'buy_harvester'
  | 'attack'
  | 'defend'
  | 'retreat'
  | 'skip_briefing'
  | 'restart';

export interface DebugApi {
  getState(): DebugState;
  issue(command: DebugCommand): void;
  setTimeScale(scale: number): void;
}

declare global {
  interface Window {
    __GAME_DEBUG__?: DebugApi;
  }
}

/** Instala el puente en `window.__GAME_DEBUG__`. */
export function installDebugBridge(game: Game): void {
  const api: DebugApi = {
    getState(): DebugState {
      const session = game.getSession();
      const world = session.world;
      const team = world.teams.US;
      return {
        supplies: team.supplies,
        population: team.population,
        populationMax: team.populationMax,
        stance: team.stance,
        elapsed: world.elapsed,
        fps: Math.round(game.getFps()),
        interactive: game.isInteractive(),
        units: world.units
          .filter((u) => u.alive)
          .map((u) => ({
            id: u.id,
            defId: u.defId,
            team: u.team,
            x: Math.round(u.transform.x),
            hp: Math.round(u.health.hp),
            state: u.state,
          })),
        enemyStructureHp: world.structureOf('VC')?.hp ?? 0,
        playerStructureHp: world.structureOf('US')?.hp ?? 0,
        ended: world.outcome,
      };
    },

    issue(command: DebugCommand): void {
      const session = game.getSession();
      switch (command) {
        case 'buy_soldier': session.trainUnit('us_rifleman'); break;
        case 'buy_harvester': session.trainUnit('us_harvester'); break;
        case 'attack': session.setStance('attack'); break;
        case 'defend': session.setStance('defend'); break;
        case 'retreat': session.setStance('retreat'); break;
        case 'skip_briefing': game.skipBriefing(); break;
        case 'restart': game.restart(); break;
      }
    },

    setTimeScale(scale: number): void {
      game.setTimeScale(scale);
    },
  };

  window.__GAME_DEBUG__ = api;
}
