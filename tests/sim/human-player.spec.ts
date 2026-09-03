import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';
import { Rng } from '../../src/core/Rng.js';
import { LEVELS, TOTAL_LEVELS } from '../../src/domain/balance/levels.js';

/**
 * ============================================================================
 * BALANCE CONTRA UN JUGADOR HUMANO
 * ============================================================================
 *
 * Esta suite existe porque la anterior mentía.
 *
 * El balance se calibró contra un jugador simulado que decide cuatro veces por
 * segundo y nunca se equivoca. Con esas cifras los tres niveles parecían bien
 * ajustados — y al probarlo una persona, el nivel 1 resultó durísimo.
 *
 * El motivo: una persona mira la pantalla, decide, toca el botón y vuelve a
 * mirar el combate. Eso son tres o cuatro segundos por decisión, no un cuarto
 * de segundo. Contra una IA que piensa cada segundo y medio, esa diferencia de
 * reflejos pesa más que cualquier decisión estratégica.
 *
 * Las políticas de aquí abajo imitan a tres alumnos reales: uno que juega por
 * primera vez, uno que ya le ha pillado el punto y uno que juega bien. El
 * criterio de aceptación es el del encargo: **competitivo pero ganable**, o
 * nadie completará la campaña en clase.
 */

const STEP = 1 / 60;

/** Perfil de atención de cada tipo de alumno. */
interface PlayerSkill {
  /** Segundos entre dos momentos de atención. */
  readonly react: number;
  /** Probabilidad de mirar la pantalla y no hacer nada. */
  readonly distraction: number;
  /** Cuántos botones pulsa seguidos cuando decide actuar. */
  readonly tapsMin: number;
  readonly tapsMax: number;
  /** Con cuánta tropa se decide a atacar. */
  readonly attacksWith: number;
  /** Si llega a usar el bombardeo. */
  readonly usesPowers: boolean;
}

const NOVATO: PlayerSkill = {
  react: 3.0, distraction: 0.35, tapsMin: 1, tapsMax: 2, attacksWith: 12, usesPowers: false,
};
const MEDIO: PlayerSkill = {
  react: 2.0, distraction: 0.2, tapsMin: 1, tapsMax: 3, attacksWith: 10, usesPowers: false,
};
const BUENO: PlayerSkill = {
  react: 1.2, distraction: 0.08, tapsMin: 2, tapsMax: 3, attacksWith: 9, usesPowers: true,
};

const SEEDS = [1, 7, 42, 99, 2024, 3, 11, 55, 123, 777] as const;

interface MatchResult {
  readonly won: boolean;
  readonly seconds: number;
  readonly unresolved: boolean;
}

/** Juega un nivel completo con un alumno simulado. */
function playAs(levelId: number, seed: number, skill: PlayerSkill): MatchResult {
  const session = new GameSession(levelId, seed, true);
  const rng = new Rng(seed * 31 + levelId);
  const level = session.level;

  const alive = (defId: string): number =>
    session.world.units.filter((u) => u.alive && u.team === 'US' && u.defId === defId).length;

  let nextDecision = skill.react;
  const maxSteps = (level.timeLimitSec + 30) / STEP;

  for (let i = 0; i < maxSteps; i++) {
    session.step(STEP);

    if (session.world.elapsed >= nextDecision) {
      nextDecision = session.world.elapsed + skill.react * rng.range(0.7, 1.4);

      if (!rng.chance(skill.distraction)) {
        const team = session.world.teams.US;
        const taps = rng.int(skill.tapsMin, skill.tapsMax);

        for (let t = 0; t < taps; t++) {
          const queued = (id: string) => team.queue.filter((q) => q.defId === id).length;
          const harvesters = alive('us_harvester') + queued('us_harvester');
          const soldiers = alive('us_rifleman') + queued('us_rifleman');
          const snipers = alive('us_sniper') + queued('us_sniper');

          if (harvesters < 3) session.trainUnit('us_harvester');
          else if (level.buildable.includes('us_sniper') && snipers < 2 && soldiers >= 5) {
            session.trainUnit('us_sniper');
          } else if (team.population < team.populationMax) session.trainUnit('us_rifleman');

          // Las órdenes se aplican al principio del paso siguiente.
          session.step(STEP);
        }

        if (skill.usesPowers) {
          for (const powerId of session.powers) {
            if (!session.canLaunch(powerId)) continue;
            const enemies = session.world.units.filter((u) => u.alive && u.team === 'VC');
            if (enemies.length >= 5) {
              const avgX = enemies.reduce((a, u) => a + u.transform.x, 0) / enemies.length;
              session.launchPower(powerId, avgX);
            }
          }
        }

        const army = alive('us_rifleman') + alive('us_sniper') + alive('us_tank');
        if (army >= skill.attacksWith) session.setStance('attack');
      }
    }

    if (session.world.outcome) {
      return {
        won: session.world.outcome.won,
        seconds: session.world.elapsed,
        unresolved: false,
      };
    }
  }

  return { won: false, seconds: session.world.elapsed, unresolved: true };
}

/** Victorias sobre las diez semillas fijas. */
function winsFor(levelId: number, skill: PlayerSkill): number {
  return SEEDS.filter((seed) => playAs(levelId, seed, skill).won).length;
}

describe('El juego es ganable por una persona', () => {
  it('el nivel 1 lo gana casi siempre alguien que juega por primera vez', () => {
    // Es el nivel donde se aprende qué hace cada botón. Si aquí se pierde, el
    // alumno abandona antes de entender el juego. Medido: 9 de 10.
    expect(winsFor(1, NOVATO)).toBeGreaterThanOrEqual(8);
  });

  it('el nivel 1 no se le resiste a nadie que le haya pillado el punto', () => {
    expect(winsFor(1, MEDIO)).toBe(SEEDS.length);
  });

  it('el nivel 2 es ganable por un novato y cómodo para un jugador medio', () => {
    // Medido: 6 de 10 y 10 de 10.
    expect(winsFor(2, NOVATO)).toBeGreaterThanOrEqual(4);
    expect(winsFor(2, MEDIO)).toBeGreaterThanOrEqual(8);
  });

  it('el nivel 3 es competitivo pero ganable', () => {
    // El requisito literal del encargo: si nadie puede con el nivel final, no
    // hay ganador y la competencia de clase se queda sin premio.
    // Medido: 6 de 10 para un novato, 9 de 10 para quien juega bien.
    const novato = winsFor(3, NOVATO);
    const bueno = winsFor(3, BUENO);

    expect(novato, 'un principiante debe poder ganarlo alguna vez').toBeGreaterThanOrEqual(3);
    expect(bueno, 'quien juega bien debe ganarlo casi siempre').toBeGreaterThanOrEqual(7);
  });

  it('un jugador medio puede completar la campaña entera', () => {
    // Es la comprobación que de verdad importa para la clase: que exista un
    // camino realista de principio a fin para un alumno normal.
    for (const level of LEVELS) {
      const wins = winsFor(level.id, MEDIO);
      expect(wins, `nivel ${level.id} con un jugador medio`).toBeGreaterThanOrEqual(7);
    }
  });

  it('la dificultad no baja de un nivel al siguiente', () => {
    const wins = LEVELS.map((l) => winsFor(l.id, NOVATO));
    expect(wins[0]).toBeGreaterThanOrEqual(wins[1] as number);
    expect(wins[1]).toBeGreaterThanOrEqual((wins[2] as number) - 1);
  });

  it('ninguna partida se queda sin resolver', () => {
    // Con techo de población, dos bandos atrincherados podían no atacarse
    // nunca y dejar la partida colgada. El límite de tiempo lo impide.
    for (const level of LEVELS) {
      for (const skill of [NOVATO, MEDIO, BUENO]) {
        const result = playAs(level.id, 42, skill);
        expect(result.unresolved, `nivel ${level.id} sin resolver`).toBe(false);
        expect(result.seconds).toBeLessThanOrEqual(level.timeLimitSec + 1);
      }
    }
  });

  it('cada nivel tiene un límite de tiempo razonable', () => {
    for (const level of LEVELS) {
      // Ni tan corto que no dé tiempo a montar una economía, ni tan largo que
      // un alumno bloqueado tenga que esperar diez minutos para reintentar.
      expect(level.timeLimitSec).toBeGreaterThanOrEqual(300);
      expect(level.timeLimitSec).toBeLessThanOrEqual(600);
    }
    expect(LEVELS).toHaveLength(TOTAL_LEVELS);
  });
});
