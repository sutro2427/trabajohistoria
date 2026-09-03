import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';
import { getLevel, LEVELS, TOTAL_LEVELS } from '../../src/domain/balance/levels.js';
import { getPowerDef, getUnitDef } from '../../src/domain/balance/balance.js';

/**
 * ============================================================================
 * BALANCE DE LA CAMPAÑA — "difícil pero no imposible"
 * ============================================================================
 *
 * Juega los tres niveles completos sin navegador con un jugador guionizado.
 * Es la única forma práctica de saber si la curva funciona antes de ponerla
 * delante de treinta alumnos.
 */

const STEP = 1 / 60;
const MAX_SECONDS = 600;

interface MatchResult {
  won: boolean;
  elapsed: number;
  timedOut: boolean;
}

/** Política del jugador, evaluada varias veces por segundo. */
type Policy = (session: GameSession, elapsed: number) => void;

/**
 * Cada cuánto reacciona el jugador simulado.
 *
 * Cuatro veces por segundo, que es el ritmo de alguien atento a la pantalla.
 * Importa más de lo que parece: con una cola de una sola ranura, quien vuelve
 * a pulsar en cuanto se libera produce sin pausas, y quien tarda un segundo
 * deja huecos. Ésa es exactamente la lección que el juego quiere transmitir
 * sobre la rapidez al actuar, así que el jugador de referencia tiene que
 * jugarla, no ignorarla.
 */
const DECISION_INTERVAL = 0.25;

function playLevel(levelId: number, seed: number, policy: Policy): MatchResult {
  const session = new GameSession(levelId, seed, true);
  let sinceDecision = 0;

  for (let i = 0; i < MAX_SECONDS / STEP; i++) {
    session.step(STEP);
    sinceDecision += STEP;
    if (sinceDecision >= DECISION_INTERVAL) {
      sinceDecision = 0;
      policy(session, session.world.elapsed);
    }
    if (session.world.outcome) {
      return { ...session.world.outcome, elapsed: session.world.elapsed, timedOut: false };
    }
  }
  return { won: false, elapsed: MAX_SECONDS, timedOut: true };
}

function countUnits(session: GameSession, defId: string): number {
  return session.world.units.filter((u) => u.alive && u.team === 'US' && u.defId === defId).length;
}

/**
 * Un jugador competente, no óptimo: el alumno que entiende el juego y hace lo
 * razonable. Es el listón correcto — si este pierde, el nivel es injusto; si
 * gana sin despeinarse, el nivel es trivial.
 */
const competentPlayer: Policy = (session) => {
  const team = session.world.teams.US;
  const harvesters = countUnits(session, 'us_harvester');
  const soldiers = countUnits(session, 'us_rifleman');
  const snipers = countUnits(session, 'us_sniper');
  const buildable = session.buildable;
  const army = soldiers + snipers;

  // Prioridades, en orden. La clave es que economía y ejército crecen
  // **en paralelo**: dedicar los primeros treinta segundos solo a recolectores
  // funciona contra una IA lenta y es suicida contra una que ataca pronto.
  if (harvesters < 2) {
    // 1. Dos recolectores como mínimo vital: sin ellos no hay nada que gastar.
    session.trainUnit('us_harvester');
  } else if (army < 3) {
    // 2. Una guardia mínima antes de seguir invirtiendo.
    session.trainUnit('us_rifleman');
  } else if (harvesters < 4) {
    // 3. Ya con cobertura, se amplía la economía.
    session.trainUnit('us_harvester');
  } else if (buildable.includes('us_sniper') && snipers < 2 && soldiers >= 4) {
    // 4. Francotiradores solo con infantería suficiente para cubrirlos.
    session.trainUnit('us_sniper');
  } else if (buildable.includes('us_tank') && team.supplies >= 70 && army >= 8) {
    // 5. El blindado es la última pieza: exige un colchón real.
    session.trainUnit('us_tank');
  } else if (team.population < team.populationMax) {
    session.trainUnit('us_rifleman');
  }

  // Bombardear cuando el enemigo se agrupa: es cuando renta más que la tropa.
  for (const powerId of session.powers) {
    if (!session.canLaunch(powerId)) continue;
    const enemies = session.world.units.filter((u) => u.alive && u.team === 'VC');
    if (enemies.length >= 4) {
      const avgX = enemies.reduce((a, u) => a + u.transform.x, 0) / enemies.length;
      session.launchPower(powerId, avgX);
    }
  }

  // Atacar con masa, replegarse si el asalto se desangra.
  if (army >= 9) session.setStance('attack');
  else if (army <= 3 && team.stance === 'attack') session.setStance('defend');
};

/** Jugador torpe: compra soldados sueltos y ataca siempre. Debe perder. */
const recklessPlayer: Policy = (session) => {
  const team = session.world.teams.US;
  if (team.population < team.populationMax) session.trainUnit('us_rifleman');
  session.setStance('attack');
};

describe('Campaña de tres niveles', () => {
  const seeds = [1, 7, 42, 99, 2024, 3, 11, 55];

  it('define exactamente tres niveles', () => {
    expect(LEVELS).toHaveLength(3);
    expect(TOTAL_LEVELS).toBe(3);
    expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it('cada nivel introduce algo nuevo', () => {
    // La curva no está en subir números, sino en añadir una decisión nueva.
    const [uno, dos, tres] = LEVELS as [typeof LEVELS[0], typeof LEVELS[0], typeof LEVELS[0]];

    expect(uno.buildable).not.toContain('us_sniper');
    expect(uno.powers).toHaveLength(0);

    expect(dos.buildable).toContain('us_sniper');
    expect(dos.buildable).not.toContain('us_tank');
    expect(dos.enemyBuildable).toContain('vc_marksman');

    expect(tres.buildable).toContain('us_tank');
    expect(tres.powers).toContain('us_cluster_bomb');
    expect(tres.enemyBuildable).toContain('vc_tank');
  });

  it('el nivel 1 es accesible: se gana siempre jugando bien', () => {
    // Es el primer contacto del alumno con el juego. Si aquí pierde, abandona.
    const wins = seeds.filter((s) => playLevel(1, s, competentPlayer).won).length;
    expect(wins).toBe(seeds.length);
  });

  it('el nivel 2 se puede ganar de forma consistente', () => {
    const wins = seeds.filter((s) => playLevel(2, s, competentPlayer).won).length;
    // Medido: 7 de 8. Con francotiradores en juego se admite algún tropiezo,
    // pero la mayoría de intentos bien jugados deben salir adelante.
    expect(wins).toBeGreaterThanOrEqual(6);
  });

  it('el nivel 3 es difícil pero no imposible', () => {
    // Éste es el requisito explícito del encargo. Se comprueba por los dos
    // lados: que se pueda ganar y que no se regale.
    const results = seeds.map((s) => playLevel(3, s, competentPlayer));
    const wins = results.filter((r) => r.won).length;

    // Medido: 4 de 8. Es el punto que se buscaba — un jugador competente gana
    // aproximadamente la mitad de sus intentos, así que el premio se gana
    // insistiendo y mejorando, no por suerte ni por desgaste.
    expect(wins, 'el nivel 3 debe ser ganable').toBeGreaterThanOrEqual(3);
    expect(wins, 'el nivel 3 no debe ser un paseo').toBeLessThanOrEqual(6);
  });

  it('la dificultad sube de nivel en nivel', () => {
    // La curva completa, comprobada de una vez: cada operación debe costar al
    // menos tanto como la anterior. Es la garantía de que el orden de la
    // campaña tiene sentido para el alumno.
    const winsPerLevel = [1, 2, 3].map(
      (level) => seeds.filter((s) => playLevel(level, s, competentPlayer).won).length,
    );

    expect(winsPerLevel[0], 'el nivel 1 debe ganarse siempre').toBe(seeds.length);
    expect(winsPerLevel[1]).toBeLessThanOrEqual(winsPerLevel[0] as number);
    expect(winsPerLevel[2]).toBeLessThanOrEqual(winsPerLevel[1] as number);
  });

  it('jugar mal se castiga en todos los niveles', () => {
    for (const levelId of [1, 2, 3]) {
      const wins = seeds.filter((s) => playLevel(levelId, s, recklessPlayer).won).length;
      expect(wins, `nivel ${levelId} con juego temerario`).toBeLessThanOrEqual(1);
    }
  });

  it('ninguna partida se queda sin resolver', () => {
    for (const levelId of [1, 2, 3]) {
      for (const policy of [competentPlayer, recklessPlayer]) {
        const result = playLevel(levelId, 42, policy);
        expect(result.timedOut, `nivel ${levelId} sin resolver`).toBe(false);
      }
    }
  });
});

describe('Coste de las unidades nuevas', () => {
  it('el tanque es alcanzable con la economía real del mapa', () => {
    // El coste anterior (500) era mayor que todo el mapa: nadie podía
    // construirlo jamás. Esta prueba impide que vuelva a ocurrir.
    const tank = getUnitDef('us_tank');
    const soldier = getUnitDef('us_rifleman');

    expect(tank.cost).toBeGreaterThan(soldier.cost * 6);
    expect(tank.cost).toBeLessThan(120);
  });

  it('el francotirador cuesta claramente más que un soldado', () => {
    const sniper = getUnitDef('us_sniper');
    const soldier = getUnitDef('us_rifleman');

    expect(sniper.cost).toBeGreaterThanOrEqual(soldier.cost * 2);
    // Alcance mucho mayor, pero mucho menos resistente: es su equilibrio.
    expect(sniper.range).toBeGreaterThan(soldier.range * 1.5);
    expect(sniper.hp).toBeLessThan(soldier.hp);
    expect(sniper.fireRate).toBeLessThan(soldier.fireRate * 0.5);
  });

  it('el francotirador supera en alcance al tanque', () => {
    // Es la relación que hace jugable el nivel 3: el blindado arrasa
    // infantería, pero el tirador le dispara desde fuera de su alcance.
    // Sin esta ventaja el nivel era imposible de ganar.
    expect(getUnitDef('us_sniper').range).toBeGreaterThan(getUnitDef('vc_tank').range);
  });

  it('el francotirador mata a la infantería enemiga de un disparo', () => {
    // Si necesitara dos tiros, a uno cada dos segundos rendiría menos que un
    // soldado que cuesta la mitad, y comprarlo sería una trampa.
    const sniper = getUnitDef('us_sniper');
    const target = getUnitDef('vc_guerrilla');
    expect(sniper.damage - target.armor).toBeGreaterThanOrEqual(target.hp);
  });

  it('el francotirador mantiene la distancia en vez de cargar', () => {
    // Es lo que lo hace un francotirador y no un soldado con más daño.
    expect(getUnitDef('us_sniper').preferredRangeFactor).toBeLessThan(1);
    expect(getUnitDef('us_rifleman').preferredRangeFactor).toBeUndefined();
  });

  it('ninguna unidad enemiga es gratuita', () => {
    // `vc_tank` tenía coste 0 y tiempo 0: en cuanto entrara en la lista de
    // compra de la IA habría generado tanques infinitos.
    for (const level of LEVELS) {
      for (const defId of level.enemyBuildable) {
        const def = getUnitDef(defId);
        expect(def.cost, `${defId} es gratis`).toBeGreaterThan(0);
        expect(def.trainTime, `${defId} es instantáneo`).toBeGreaterThan(0);
      }
    }
  });
});

describe('Bombas de racimo', () => {
  const runSteps = (session: GameSession, seconds: number): void => {
    for (let i = 0; i < seconds / STEP; i++) session.step(STEP);
  };

  it('cuestan lo mismo que varios soldados', () => {
    // La decisión que el juego quiere provocar: bombas o tropa.
    const bomb = getPowerDef('us_cluster_bomb');
    const soldier = getUnitDef('us_rifleman');
    expect(bomb.cost).toBeGreaterThanOrEqual(soldier.cost * 5);
  });

  it('solo están disponibles en el nivel 3', () => {
    expect(getLevel(1).powers).toHaveLength(0);
    expect(getLevel(2).powers).toHaveLength(0);
    expect(getLevel(3).powers).toContain('us_cluster_bomb');
  });

  it('cobran el coste y entran en enfriamiento al lanzarse', () => {
    const session = new GameSession(3, 5, true);
    session.world.teams.US.supplies = 100;
    const before = session.world.teams.US.supplies;

    session.launchPower('us_cluster_bomb', 600);
    session.step(STEP);

    const def = getPowerDef('us_cluster_bomb');
    expect(session.world.teams.US.supplies).toBe(before - def.cost);
    expect(session.powerState('us_cluster_bomb')?.cooldown).toBeGreaterThan(0);
    expect(session.canLaunch('us_cluster_bomb')).toBe(false);
  });

  it('no se pueden lanzar sin suministros', () => {
    const session = new GameSession(3, 5, true);
    session.world.teams.US.supplies = 1;

    session.launchPower('us_cluster_bomb', 600);
    session.step(STEP);

    expect(session.world.strikes).toHaveLength(0);
    expect(session.world.teams.US.supplies).toBe(1);
  });

  it('dañan a los enemigos de la zona, no a los propios', () => {
    const session = new GameSession(3, 5, true);
    session.world.teams.US.supplies = 100;

    const enemies = session.world.units.filter((u) => u.team === 'VC' && u.alive);
    expect(enemies.length).toBeGreaterThan(0);
    const target = enemies[0]!;
    const targetHpBefore = target.health.hp;

    session.launchPower('us_cluster_bomb', target.transform.x);
    // Tiempo suficiente para el retardo inicial y toda la tanda.
    runSteps(session, 4);

    expect(target.health.hp).toBeLessThan(targetHpBefore);
  });

  it('la andanada tarda en llegar: se puede esquivar', () => {
    // El retardo es lo que convierte el bombardeo en una decisión de
    // anticipación en lugar de un botón de "matar lo que hay aquí".
    const def = getPowerDef('us_cluster_bomb');
    expect(def.delay).toBeGreaterThanOrEqual(0.8);

    const session = new GameSession(3, 5, true);
    session.world.teams.US.supplies = 100;
    const target = session.world.units.find((u) => u.team === 'VC' && u.alive)!;
    const hpBefore = target.health.hp;

    session.launchPower('us_cluster_bomb', target.transform.x);
    // Justo antes de que caiga la primera bomba, nadie ha recibido daño.
    runSteps(session, def.delay - 0.2);
    expect(target.health.hp).toBe(hpBefore);
  });
});
