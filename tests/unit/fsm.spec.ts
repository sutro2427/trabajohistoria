import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';
import { getUnitDef } from '../../src/domain/balance/balance.js';
import { UnitFactory } from '../../src/domain/factories/UnitFactory.js';
import { StateRegistry } from '../../src/domain/states/StateRegistry.js';
import { DamageSystem } from '../../src/domain/systems/DamageSystem.js';

const STEP = 1 / 60;

function run(session: GameSession, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) session.step(STEP);
}

describe('Máquina de estados', () => {
  it('registra todos los estados que la simulación puede pedir', () => {
    const registry = new StateRegistry();
    const expected = [
      'idle', 'move', 'engage', 'attack', 'hit', 'die',
      'toNode', 'gathering', 'returning', 'depositing',
    ];
    for (const id of expected) expect(() => registry.get(id as never)).not.toThrow();
    expect(registry.ids()).toHaveLength(expected.length);
  });

  it('una unidad muerta queda marcada como tal y libera su población', () => {
    // Es la regresión del bug que dejaba cadáveres contando como vivos:
    // ocupaban población y podían impedir que la partida terminase.
    const session = new GameSession(1, 4);
    const factory = new UnitFactory(getUnitDef);
    const damage = new DamageSystem();

    const soldier = factory.create(session.world, 'us_rifleman', 800);
    const popAfterSpawn = session.world.teams.US.population;
    expect(popAfterSpawn).toBe(1);

    damage.damageUnit(session.world, soldier, 9999, getUnitDef('us_rifleman'));
    session.step(STEP);

    expect(soldier.alive).toBe(false);
    expect(soldier.state).toBe('die');
    expect(session.world.teams.US.population).toBe(0);
  });

  it('emite el evento de muerte exactamente una vez', () => {
    const session = new GameSession(1, 4);
    const factory = new UnitFactory(getUnitDef);
    const damage = new DamageSystem();

    let deaths = 0;
    session.world.bus.on('unit:died', () => deaths++);

    const soldier = factory.create(session.world, 'us_rifleman', 800);
    damage.damageUnit(session.world, soldier, 9999, getUnitDef('us_rifleman'));
    run(session, 3);

    expect(deaths).toBe(1);
  });

  it('ninguna unidad queda atrapada en el estado de aturdimiento', () => {
    // Sin el periodo de gracia entre aturdimientos, el fuego sostenido
    // encadenaría impactos y paralizaría a la unidad para siempre: quien
    // disparase primero ganaría automáticamente.
    const session = new GameSession(1, 9);
    const factory = new UnitFactory(getUnitDef);
    const damage = new DamageSystem();
    const def = getUnitDef('us_rifleman');

    const soldier = factory.create(session.world, 'us_rifleman', 800);

    // Se le dispara sin descanso durante tres segundos.
    for (let i = 0; i < 180; i++) {
      damage.damageUnit(session.world, soldier, 1, def);
      soldier.health.hp = def.hp; // se le mantiene vivo para aislar el aturdimiento
      session.step(STEP);
    }

    expect(soldier.alive).toBe(true);
    // Debe haber podido salir del aturdimiento al menos una vez.
    expect(soldier.state).not.toBe('hit');
  });

  it('el recolector recorre las cuatro fases de su ciclo', () => {
    const session = new GameSession(1, 21);
    session.trainUnit('us_harvester');
    run(session, 5);

    const harvester = session.world.units.find((u) => u.defId === 'us_harvester');
    expect(harvester).toBeDefined();

    const seen = new Set<string>();
    for (let i = 0; i < 60 * 15; i++) {
      session.step(STEP);
      if (harvester!.alive) seen.add(harvester!.state);
    }

    expect(seen).toContain('toNode');
    expect(seen).toContain('gathering');
    expect(seen).toContain('returning');
    expect(seen).toContain('depositing');
  });

  it('la orden de retirada devuelve a las tropas hacia la base', () => {
    const session = new GameSession(1, 33);
    const factory = new UnitFactory(getUnitDef);
    // Un soldado bien adelantado en el mapa.
    const soldier = factory.create(session.world, 'us_rifleman', 900);

    session.setStance('retreat');
    const xBefore = soldier.transform.x;
    run(session, 6);

    expect(soldier.transform.x).toBeLessThan(xBefore);
  });

  it('la orden de ataque empuja a las tropas hacia el enemigo', () => {
    const session = new GameSession(1, 34);
    const factory = new UnitFactory(getUnitDef);
    const soldier = factory.create(session.world, 'us_rifleman', 400);

    session.setStance('attack');
    const xBefore = soldier.transform.x;
    run(session, 6);

    expect(soldier.transform.x).toBeGreaterThan(xBefore);
  });

  it('una unidad creada después de la orden se suma al avance por sí sola', () => {
    // Es la ventaja de que la orden sea una variable del bando y no una lista
    // de destinos: los refuerzos se incorporan sin volver a dar la orden.
    const session = new GameSession(1, 35);
    session.setStance('attack');
    session.step(STEP);

    const factory = new UnitFactory(getUnitDef);
    const reinforcement = factory.create(session.world, 'us_rifleman', 300);
    const xBefore = reinforcement.transform.x;
    run(session, 5);

    expect(reinforcement.transform.x).toBeGreaterThan(xBefore);
  });
});
