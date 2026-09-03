import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';
import { getUnitDef, WORLD } from '../../src/domain/balance/balance.js';
import { getLevel } from '../../src/domain/balance/levels.js';
import { UnitFactory } from '../../src/domain/factories/UnitFactory.js';

const STEP = 1 / 60;

function run(session: GameSession, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps && !session.world.outcome; i++) session.step(STEP);
}

describe('IA enemiga', () => {
  it('empieza el nivel con la guarnición indicada', () => {
    const session = new GameSession(1, 1);
    const level = getLevel(1);
    expect(session.world.countLiving('VC')).toBe(level.garrison.length);
    // El enunciado pedía exactamente dos soldados vietnamitas defendiendo.
    expect(level.garrison).toHaveLength(2);
  });

  it('envía refuerzos a partir de la primera oleada', () => {
    const session = new GameSession(1, 3);
    const initial = session.world.teams.VC.totalSpawned;
    run(session, 40); // la primera oleada llega a los 25 s
    expect(session.world.teams.VC.totalSpawned).toBeGreaterThan(initial);
  });

  it('se repliega a defender cuando el jugador cruza su línea de alarma', () => {
    // Sin esta regla bastaría con esperar a que la IA saliera de su base y
    // colarse por detrás: el nivel se ganaría con un truco, no con estrategia.
    const session = new GameSession(1, 4);
    const factory = new UnitFactory(getUnitDef);
    const level = getLevel(1);

    // El soldado se coloca bien dentro de la zona de alarma y con orden de
    // atacar, para que siga avanzando: en postura defensiva retrocedería hacia
    // su base y dejaría de cruzar la línea antes de que la IA reevaluase.
    factory.create(session.world, 'us_rifleman', WORLD.vcBaseX - level.ai.defenseLineOffset + 90);
    session.setStance('attack');
    run(session, 2);

    expect(session.world.teams.VC.stance).toBe('defend');
  });

  it('nunca supera su tope total de unidades generadas', () => {
    // El tope duro es lo que garantiza que el nivel termina siempre.
    const session = new GameSession(1, 8);
    run(session, 400);
    const level = getLevel(1);
    expect(session.world.teams.VC.totalSpawned).toBeLessThanOrEqual(
      level.ai.maxTotalSpawned + level.garrison.length,
    );
  });

  it('ataca al jugador que no construye ejército', () => {
    // Con el umbral de agresión, si el jugador no tiene fuerza de combate la
    // IA debe castigarlo en lugar de quedarse esperando en casa.
    const session = new GameSession(1, 6);
    run(session, 70);
    expect(session.world.teams.VC.stance).toBe('attack');
  });

  it('mantiene la postura estable en vez de oscilar cada paso', () => {
    // La IA reevalúa dos veces por segundo. Si decidiera en cada paso, las
    // unidades cambiarían de rumbo 60 veces por segundo y quedarían clavadas.
    const session = new GameSession(1, 12);
    run(session, 30);

    let changes = 0;
    let last = session.world.teams.VC.stance;
    for (let i = 0; i < 60 * 10; i++) {
      session.step(STEP);
      if (session.world.teams.VC.stance !== last) {
        changes++;
        last = session.world.teams.VC.stance;
      }
    }
    // En diez segundos, un puñado de cambios es normal; decenas serían un fallo.
    expect(changes).toBeLessThan(8);
  });
});
