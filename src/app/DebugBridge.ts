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
  /** Nivel de campaña en curso (1..3). */
  level: number;
  /** Niveles ya completados en este intento de campaña. */
  levelsDone: number;
  fps: number;
  interactive: boolean;
  units: { id: number; defId: string; team: string; x: number; hp: number; state: string }[];
  /** Estado del bando enemigo: sirve para comprobar que su economia es real. */
  enemy: { supplies: number; population: number; stance: Stance; harvested: number };
  /** Depositos del mapa con lo que les queda. */
  nodes: { id: number; team: string; x: number; amount: number; capacity: number }[];
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
  /** Salta a un nivel de campaña sin jugar los anteriores. */
  jumpToLevel(levelId: number): void;
  /** Compra cualquier unidad por su identificador del catálogo. */
  train(defId: string): void;
  /** Lanza un poder en una coordenada del mundo. */
  launchPower(powerId: string, worldX: number): void;
  /** Fija los suministros del jugador. Solo para pruebas automatizadas. */
  setSupplies(amount: number): void;
  /** Fija el aumento de la cámara. Solo para pruebas automatizadas. */
  setZoom(zoom: number): void;
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
        level: game.getLevelId(),
        levelsDone: game.getRun()?.results.length ?? 0,
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
        enemy: {
          supplies: world.teams.VC.supplies,
          population: world.teams.VC.population,
          stance: world.teams.VC.stance,
          harvested: world.teams.VC.harvested,
        },
        nodes: world.nodes.map((n) => ({
          id: n.id,
          team: n.team,
          x: n.x,
          amount: Math.round(n.amount),
          capacity: n.capacity,
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
        case 'skip_briefing': game.skipToBattle(); break;
        case 'restart': game.skipToBattle(); break;
      }
    },

    setTimeScale(scale: number): void {
      game.setTimeScale(scale);
    },

    /**
     * Salta a un nivel concreto sin jugar los anteriores.
     * Es lo que permite que un test verifique el nivel 3 en segundos.
     */
    jumpToLevel(levelId: number): void {
      game.jumpToLevel(levelId);
    },

    /** Compra cualquier unidad por su identificador del catálogo. */
    train(defId: string): void {
      game.getSession().trainUnit(defId);
    },

    /** Lanza un poder en una coordenada del mundo. */
    launchPower(powerId: string, worldX: number): void {
      game.getSession().launchPower(powerId, worldX);
    },

    /**
     * Fija los suministros del jugador.
     *
     * Existe para que un test pueda verificar comportamientos que exigen una
     * economía concreta —el bombardeo cuesta 30— sin tener que jugar dos
     * minutos hasta reunirlos.
     */
    /**
     * Fija el aumento. Existe para poder comparar encuadres en una captura sin
     * tener que reproducir un pellizco de dos dedos.
     */
    setZoom(zoom: number): void {
      game.setZoom(zoom);
    },

    setSupplies(amount: number): void {
      const team = game.getSession().world.teams.US;
      team.supplies = Math.max(0, amount);
      game.getSession().world.bus.emit('supplies:changed', {
        team: 'US',
        value: team.supplies,
        delta: 0,
      });
    },
  };

  window.__GAME_DEBUG__ = api;
}
