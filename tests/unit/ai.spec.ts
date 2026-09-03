import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';
import { getUnitDef, WORLD } from '../../src/domain/balance/balance.js';
import { getAiProfile } from '../../src/domain/balance/difficulty.js';
import { getLevel } from '../../src/domain/balance/levels.js';
import { UnitFactory } from '../../src/domain/factories/UnitFactory.js';
import type { DifficultyId } from '../../src/domain/balance/difficulty.js';

const STEP = 1 / 60;

function run(session: GameSession, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps && !session.world.outcome; i++) session.step(STEP);
}

function countAlive(session: GameSession, defId: string): number {
  return session.world.units.filter((u) => u.alive && u.defId === defId).length;
}

function newSession(seed: number, difficulty: DifficultyId = 'normal'): GameSession {
  return new GameSession(1, seed, false, 0, difficulty);
}

describe('IA enemiga', () => {
  it('empieza el nivel con la guarnición indicada', () => {
    const session = newSession(1);
    const level = getLevel(1);
    expect(session.world.countLiving('VC')).toBe(level.garrison.length);
    expect(level.garrison).toHaveLength(2);
  });

  it('arranca con los mismos suministros y el mismo tope de población que el jugador', () => {
    // El requisito de partida equilibrada, comprobado en el punto de partida.
    const { teams } = newSession(2).world;
    expect(teams.VC.supplies).toBe(teams.US.supplies);
    expect(teams.VC.populationMax).toBe(teams.US.populationMax);
  });

  it('manda porteadores a los depósitos y recolecta de verdad', () => {
    // La diferencia de fondo con la IA anterior: los suministros del enemigo
    // ya no aparecen solos, los trae alguien andando desde un depósito.
    const session = newSession(3);
    run(session, 45);

    expect(countAlive(session, 'vc_harvester')).toBeGreaterThan(0);
    expect(session.world.teams.VC.harvested).toBeGreaterThan(0);
  });

  it('los depósitos enemigos pierden suministros conforme trabaja su economía', () => {
    const session = newSession(11);
    const vcNodes = session.world.nodes.filter((n) => n.team === 'VC');
    const before = vcNodes.reduce((acc, n) => acc + n.amount, 0);

    run(session, 60);

    const after = vcNodes.reduce((acc, n) => acc + n.amount, 0);
    expect(after).toBeLessThan(before);
  });

  it('nunca produce una unidad que no haya pagado', () => {
    // Es la invariante que sostiene toda la petición: sin soldados gratis.
    // Si la IA hubiera generado una sola unidad sin coste, el mínimo que
    // podría haber costado su producción superaría lo que ha ingresado.
    const level = getLevel(1);
    const cheapest = Math.min(...level.enemyBuildable.map((id) => getUnitDef(id).cost));

    for (const seed of [4, 17, 55]) {
      const session = newSession(seed, 'impossible');
      run(session, 150);

      const vc = session.world.teams.VC;
      const bought = vc.totalSpawned - level.garrison.length;
      const income = level.startingSupplies + vc.harvested;

      expect(bought * cheapest).toBeLessThanOrEqual(income);
    }
  });

  it('respeta el tope de población igual que el jugador', () => {
    const session = newSession(21, 'impossible');
    run(session, 240);
    const vc = session.world.teams.VC;
    expect(vc.population).toBeLessThanOrEqual(vc.populationMax);
  });

  it('se repliega a defender cuando el jugador cruza su línea de alarma', () => {
    // Sin esta regla bastaría con esperar a que la IA saliera de su base y
    // colarse por detrás: el nivel se ganaría con un truco, no con estrategia.
    const session = newSession(4);
    const factory = new UnitFactory(getUnitDef);
    const profile = getAiProfile('normal');

    // El soldado se coloca bien dentro de la zona de alarma y con orden de
    // atacar, para que siga avanzando: en postura defensiva retrocedería hacia
    // su base y dejaría de cruzar la línea antes de que la IA reaccionase.
    factory.create(session.world, 'us_rifleman', WORLD.vcBaseX - profile.defenseLineOffset + 60);
    session.setStance('attack');
    // Se le da margen para el retardo de reacción de Normal (2,5 s).
    run(session, 5);

    expect(session.world.teams.VC.stance).toBe('defend');
  });

  it('reacciona antes a una invasión en Imposible que en Normal', () => {
    // Se mide lo que tarda el bando entero en darse la vuelta desde que le
    // pisan el territorio. Para que el punto de partida sea una postura
    // ofensiva de verdad, se le da a la IA un ejército y ningún enemigo a la
    // vista: con eso ataca, y solo entonces se cuela el intruso.
    const secondsToReact = (difficulty: DifficultyId): number => {
      const session = newSession(7, difficulty);
      const factory = new UnitFactory(getUnitDef);
      const profile = getAiProfile(difficulty);

      for (let i = 0; i < 12; i++) {
        factory.create(session.world, 'vc_guerrilla', WORLD.vcBaseX - 30 - i * 12);
      }
      run(session, 5);
      expect(session.world.teams.VC.stance).toBe('attack');

      factory.create(session.world, 'us_rifleman', WORLD.vcBaseX - profile.defenseLineOffset + 40);

      let seconds = 0;
      while (session.world.teams.VC.stance !== 'defend' && seconds < 10) {
        session.step(STEP);
        seconds += STEP;
      }
      return seconds;
    };

    const fast = secondsToReact('impossible');
    const slow = secondsToReact('normal');
    expect(fast).toBeLessThan(slow);
    // Y en términos absolutos: Imposible responde en menos de un segundo.
    expect(fast).toBeLessThan(1);
  });

  it('ataca al jugador que no construye ejército', () => {
    // Con el umbral de agresión, si el jugador no tiene fuerza de combate la
    // IA debe castigarlo en lugar de quedarse esperando en casa.
    const session = newSession(6);
    run(session, 120);
    expect(session.world.teams.VC.stance).toBe('attack');
  });

  it('mantiene la postura estable en vez de oscilar cada paso', () => {
    // La IA reevalúa a intervalos. Si decidiera en cada paso, las unidades
    // cambiarían de rumbo 60 veces por segundo y quedarían clavadas.
    const session = newSession(12);
    run(session, 30);

    let changes = 0;
    let last = session.world.teams.VC.stance;
    for (let i = 0; i < 60 * 10 && !session.world.outcome; i++) {
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

describe('Perfiles de dificultad', () => {
  it('ninguno le regala recursos ni unidades a la IA', () => {
    // La comprobación estructural del requisito: los tres perfiles arrancan la
    // partida exactamente con lo mismo, y lo único que los separa son
    // parámetros de decisión.
    const supplies = new Set<number>();
    const popMax = new Set<number>();
    const garrison = new Set<number>();

    for (const difficulty of ['normal', 'hard', 'impossible'] as const) {
      const session = newSession(9, difficulty);
      supplies.add(session.world.teams.VC.supplies);
      popMax.add(session.world.teams.VC.populationMax);
      garrison.add(session.world.countLiving('VC'));
    }

    expect(supplies.size).toBe(1);
    expect(popMax.size).toBe(1);
    expect(garrison.size).toBe(1);
  });

  it('a mayor dificultad, mejor economía con las mismas reglas', () => {
    // Lo que sube al cambiar de perfil no es el número de enemigos regalados
    // sino la calidad de la gestión: más porteadores trabajando y por tanto
    // más suministros ingresados de los mismos depósitos.
    //
    // Se mide a los 50 s, con la partida todavía en marcha en las tres
    // dificultades: más adelante, la que gana antes deja de recolectar y lo
    // que se compararía sería la duración del combate, no la economía.
    const economyAt = (difficulty: DifficultyId): { harvesters: number; harvested: number } => {
      let harvesters = 0;
      let harvested = 0;
      for (const seed of [31, 32, 33]) {
        const session = newSession(seed, difficulty);
        run(session, 50);
        harvesters += countAlive(session, 'vc_harvester');
        harvested += session.world.teams.VC.harvested;
      }
      return { harvesters, harvested };
    };

    const normal = economyAt('normal');
    const impossible = economyAt('impossible');

    expect(impossible.harvesters).toBeGreaterThan(normal.harvesters);
    expect(impossible.harvested).toBeGreaterThan(normal.harvested);
  });
});
