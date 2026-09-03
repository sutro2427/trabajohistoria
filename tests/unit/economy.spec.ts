import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';
import { getUnitDef, harvesterIncomePerSecond, WORLD } from '../../src/domain/balance/balance.js';

const STEP = 1 / 60;

/** Avanza la simulación `seconds` segundos con el paso fijo real del juego. */
function run(session: GameSession, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) session.step(STEP);
}

describe('Economía y recolección', () => {
  it('el ciclo del recolector entrega ~1 suministro cada 2 segundos', () => {
    // Esta es la especificación literal del juego, así que se verifica contra
    // el comportamiento real de la simulación y no contra la fórmula.
    //
    // La medición se hace antes de los 25 s, que es cuando llega la primera
    // oleada enemiga: a partir de ahí el recolector puede morir y lo que se
    // estaría midiendo sería el combate, no la economía.
    const session = new GameSession(1, 42);
    const team = session.world.teams.US;

    session.trainUnit('us_harvester');
    run(session, 5); // aparece tras 4 s de entrenamiento y empieza a caminar

    const suppliesAtStart = team.supplies;
    run(session, 18);
    const produced = team.supplies - suppliesAtStart;

    // 18 s a 1 suministro cada ~2,1 s ≈ 8,6, y las entregas llegan de tres en
    // tres, así que el valor observado cae en 6-9.
    expect(produced).toBeGreaterThanOrEqual(6);
    expect(produced).toBeLessThanOrEqual(10);
  });

  it('el ciclo completo dura ~6,3 s y entrega 3 suministros', () => {
    // Verifica la estructura interna del ciclo (ida, acopio, vuelta, entrega),
    // que es de donde sale la tasa de 1 suministro cada 2 segundos.
    const session = new GameSession(1, 42);
    session.trainUnit('us_harvester');
    run(session, 12); // se deja completar un primer ciclo de calentamiento

    const harvester = session.world.units.find((u) => u.defId === 'us_harvester');
    expect(harvester).toBeDefined();

    const team = session.world.teams.US;

    /** Avanza hasta la próxima entrega y devuelve cuánto se entregó. */
    const waitForDelivery = (): { seconds: number; amount: number } => {
      const before = team.supplies;
      let seconds = 0;
      while (team.supplies === before && seconds < 15) {
        session.step(STEP);
        seconds += STEP;
      }
      return { seconds, amount: team.supplies - before };
    };

    // La primera entrega solo sirve para sincronizarse con el inicio del ciclo:
    // cronometrar desde un instante arbitrario mediría un ciclo parcial.
    waitForDelivery();
    const { seconds: elapsed, amount: delivered } = waitForDelivery();

    expect(delivered).toBe(3);
    expect(elapsed).toBeGreaterThan(5.5);
    expect(elapsed).toBeLessThan(7.0);
    // 3 suministros por ciclo ÷ duración del ciclo ≈ 1 cada 2 s.
    expect(elapsed / delivered).toBeGreaterThan(1.8);
    expect(elapsed / delivered).toBeLessThan(2.4);
  });

  it('la fórmula documentada conserva el ritmo económico de referencia', () => {
    // El encargo era explícito: no tocar la velocidad de recolección. Con el
    // depósito más cercano a 80 px salen 0,53 suministros/s, a un 6 % del
    // 0,5/s que daba el punto de acopio único de la versión anterior.
    const rate = harvesterIncomePerSecond(getUnitDef('us_harvester'));
    expect(rate).toBeGreaterThan(0.47);
    expect(rate).toBeLessThan(0.57);
  });

  it('trabajar un depósito lejano rinde menos que uno cercano', () => {
    // Es la consecuencia buscada de repartir los depósitos: la economía se
    // encarece según se agotan los cómodos, sin cambiar la unidad.
    const def = getUnitDef('us_harvester');
    const near = harvesterIncomePerSecond(def, WORLD.resourceOffsets[0]);
    const far = harvesterIncomePerSecond(def, WORLD.resourceOffsets[4]);
    expect(far).toBeLessThan(near);
    // El depósito más lejano rinde un 42 % de lo que rinde el más cercano.
    // Es una penalización fuerte —que es el objetivo— pero no lo convierte en
    // inútil: cinco recolectores en el bolsillo del fondo siguen dando 1,3
    // suministros por segundo, suficiente para sostener la producción.
    expect(far).toBeGreaterThan(near * 0.4);
  });

  it('no permite comprar sin suministros suficientes', () => {
    const session = new GameSession(1, 1);
    const team = session.world.teams.US;
    team.supplies = 2; // menos que el coste del soldado (5)

    session.trainUnit('us_rifleman');
    session.step(STEP);

    expect(team.queue).toHaveLength(0);
    expect(team.supplies).toBe(2);
  });

  it('cobra el coste al encolar, no al aparecer la unidad', () => {
    const session = new GameSession(1, 1);
    const team = session.world.teams.US;
    const before = team.supplies;

    session.trainUnit('us_rifleman');
    session.step(STEP);

    expect(team.supplies).toBe(before - getUnitDef('us_rifleman').cost);
    expect(team.queue).toHaveLength(1);
  });

  it('respeta la cola de una sola ranura', () => {
    // La cola de una ranura es el regulador del ritmo: si se rompe,
    // la economía deja de importar y el juego pierde su tensión.
    const session = new GameSession(1, 1);
    const team = session.world.teams.US;
    team.supplies = 100;

    session.trainUnit('us_rifleman');
    session.trainUnit('us_rifleman');
    session.trainUnit('us_rifleman');
    session.step(STEP);

    expect(team.queue).toHaveLength(1);
  });

  it('respeta el límite de población contando también la cola', () => {
    const session = new GameSession(1, 1);
    const team = session.world.teams.US;
    team.supplies = 1000;
    team.populationMax = 2;

    // Dos unidades caben; la tercera no debe entrar.
    session.trainUnit('us_rifleman');
    run(session, 3.1);
    session.trainUnit('us_rifleman');
    run(session, 3.1);
    const suppliesBefore = team.supplies;
    session.trainUnit('us_rifleman');
    session.step(STEP);

    expect(team.population).toBe(2);
    expect(team.queue).toHaveLength(0);
    expect(team.supplies).toBe(suppliesBefore); // no se cobró la compra rechazada
  });

  it('la unidad aparece exactamente tras su tiempo de entrenamiento', () => {
    const session = new GameSession(1, 1);
    session.trainUnit('us_rifleman'); // 3.0 s

    run(session, 2.9);
    expect(session.world.countLiving('US')).toBe(0);

    run(session, 0.2);
    expect(session.world.countLiving('US')).toBe(1);
  });
});
