import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';

/**
 * ============================================================================
 * PARTIDAS COMPLETAS SIMULADAS
 * ============================================================================
 *
 * Juega niveles enteros sin navegador, con un jugador guionizado. Es la única
 * forma práctica de validar el *balance*: si el nivel se puede ganar, cuánto
 * dura, y si castiga las estrategias que debe castigar.
 *
 * Es posible porque el paquete `domain/` no toca el DOM. Diez partidas
 * completas corren en menos de un segundo.
 */

const STEP = 1 / 60;
const MAX_SECONDS = 600;

/** Decisiones del jugador, evaluadas una vez por segundo de partida. */
type Policy = (session: GameSession, elapsed: number) => void;

interface MatchResult {
  won: boolean;
  loot: number;
  elapsed: number;
  timedOut: boolean;
}

/** Juega una partida completa aplicando una política y devuelve el resultado. */
function playMatch(seed: number, policy: Policy, levelId = 1): MatchResult {
  const session = new GameSession(levelId, seed);
  let sinceDecision = 0;

  for (let i = 0; i < MAX_SECONDS / STEP; i++) {
    session.step(STEP);

    sinceDecision += STEP;
    if (sinceDecision >= 1) {
      sinceDecision = 0;
      policy(session, session.world.elapsed);
    }

    if (session.world.outcome) {
      return { ...session.world.outcome, elapsed: session.world.elapsed, timedOut: false };
    }
  }
  return { won: false, loot: 0, elapsed: MAX_SECONDS, timedOut: true };
}

/**
 * Política estándar: la apertura que enseñaría cualquier guía del género.
 * Tres recolectores primero, luego soldados, y atacar al reunir cinco.
 */
const standardPolicy: Policy = (session) => {
  const world = session.world;
  const team = world.teams.US;

  const harvesters = world.units.filter(
    (u) => u.alive && u.team === 'US' && u.defId === 'us_harvester',
  ).length;
  const soldiers = world.units.filter(
    (u) => u.alive && u.team === 'US' && u.defId === 'us_rifleman',
  ).length;

  if (harvesters < 3) {
    session.trainUnit('us_harvester');
  } else if (team.population < team.populationMax) {
    session.trainUnit('us_rifleman');
  }

  // Atacar con masa suficiente; replegarse si el ataque se ha desangrado.
  if (soldiers >= 5) session.setStance('attack');
  else if (soldiers <= 1 && team.stance === 'attack') session.setStance('defend');
};

/** Política de economía pura: nunca compra soldados. Debe perder. */
const greedyPolicy: Policy = (session) => {
  const team = session.world.teams.US;
  if (team.population < team.populationMax) session.trainUnit('us_harvester');
};

/** Política de prisas: solo soldados, sin economía. Ritmo muy lento. */
const rushPolicy: Policy = (session) => {
  const team = session.world.teams.US;
  if (team.population < team.populationMax) session.trainUnit('us_rifleman');
  session.setStance('attack');
};

describe('Balance del nivel 1', () => {
  const seeds = [1, 2, 3, 7, 13, 42, 99, 123, 777, 2024];

  it('se puede ganar con la apertura estándar, en todas las semillas', () => {
    const results = seeds.map((seed) => playMatch(seed, standardPolicy));
    const wins = results.filter((r) => r.won).length;

    // El nivel de apertura debe ser ganable de forma fiable: si un jugador
    // aplica la estrategia correcta y aun así pierde, el nivel está roto.
    expect(wins).toBe(seeds.length);
  });

  it('la partida dura entre uno y cinco minutos', () => {
    // El ritmo objetivo es el de Stick War: una partida corta y con tensión,
    // no una guerra de desgaste.
    const results = seeds.map((seed) => playMatch(seed, standardPolicy));
    for (const r of results) {
      expect(r.timedOut).toBe(false);
      expect(r.elapsed).toBeGreaterThan(50);
      expect(r.elapsed).toBeLessThan(300);
    }
  });

  it('el botín nunca supera el máximo del nivel', () => {
    const results = seeds.map((seed) => playMatch(seed, standardPolicy));
    for (const r of results) {
      expect(r.loot).toBeGreaterThanOrEqual(0);
      expect(r.loot).toBeLessThanOrEqual(50);
    }
  });

  it('invertir solo en economía lleva a la derrota', () => {
    // Si acumular recolectores fuese viable, no habría decisión estratégica:
    // la tensión entre economía y ejército es el núcleo del juego.
    const results = seeds.map((seed) => playMatch(seed, greedyPolicy));
    const wins = results.filter((r) => r.won).length;
    expect(wins).toBe(0);
  });

  it('ninguna partida se queda colgada sin resolverse', () => {
    // Una partida sin final posible sería el peor fallo del sistema de
    // victoria: el jugador quedaría atrapado sin poder ganar ni perder.
    const policies: Policy[] = [standardPolicy, greedyPolicy, rushPolicy];
    for (const policy of policies) {
      for (const seed of [1, 42, 777]) {
        const r = playMatch(seed, policy);
        expect(r.timedOut).toBe(false);
      }
    }
  });

  it('la simulación es determinista: la misma semilla da el mismo resultado', () => {
    // El determinismo es lo que permite reproducir un fallo a partir de su
    // semilla en lugar de intentar recrearlo a mano.
    const a = playMatch(42, standardPolicy);
    const b = playMatch(42, standardPolicy);
    expect(a).toEqual(b);
  });

  it('la IA enemiga respeta su tope de unidades generadas', () => {
    const session = new GameSession(1, 5);
    for (let i = 0; i < 400 / STEP; i++) {
      session.step(STEP);
      if (session.world.outcome) break;
    }
    // El tope duro es lo que garantiza que el nivel termina.
    expect(session.world.teams.VC.totalSpawned).toBeLessThanOrEqual(
      session.level.ai.maxTotalSpawned + session.level.garrison.length,
    );
  });
});
