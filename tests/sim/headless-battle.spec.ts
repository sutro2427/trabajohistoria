import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';
import { getAiProfile } from '../../src/domain/balance/difficulty.js';
import { getUnitDef } from '../../src/domain/balance/balance.js';
import type { DifficultyId } from '../../src/domain/balance/difficulty.js';
import { getLevel } from '../../src/domain/balance/levels.js';
import { UnitFactory } from '../../src/domain/factories/UnitFactory.js';

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
function playMatch(
  seed: number,
  policy: Policy,
  difficulty: DifficultyId = 'normal',
  levelId = 1,
): MatchResult {
  const session = new GameSession(levelId, seed, false, 0, difficulty);
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
 * Tres recolectores primero, luego soldados, y atacar al reunir escuadra.
 *
 * Los dos umbrales se corrigieron al medir la campaña actual. Antes atacaba
 * con cinco soldados y solo se replegaba cuando le quedaba uno, y eso, contra
 * un defensor que aguanta en su línea y con el reloj de la operación corriendo,
 * es la forma más rápida de perder: entra a goteo, pierde la escuadra entera y
 * vuelve a empezar hasta que se acaba el tiempo. Medido sobre 30 semillas, ese
 * bucle ganaba 13 de 30; juntar siete y retirarse al bajar de tres gana 30 de
 * 30. La política tiene que representar a un jugador que sigue una guía, no a
 * uno que regala su ejército.
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

  // Atacar con masa suficiente; replegarse antes de que el ataque se desangre.
  if (soldiers >= 7) session.setStance('attack');
  else if (soldiers <= 3 && team.stance === 'attack') session.setStance('defend');
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

  it('se puede ganar con la apertura estándar, casi siempre', () => {
    const results = seeds.map((seed) => playMatch(seed, standardPolicy));
    const wins = results.filter((r) => r.won).length;

    // El nivel de apertura debe ser ganable de forma fiable: si un jugador
    // aplica la estrategia correcta y aun así pierde, el nivel está roto.
    //
    // No se exige el pleno porque desde que cada operación tiene límite de
    // tiempo, una apertura muy lenta puede quedarse sin reloj — y eso es
    // deliberado: la mitad del mensaje del juego es actuar a tiempo.
    expect(wins).toBeGreaterThanOrEqual(seeds.length - 2);
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

  it('la IA no produce más de lo que su economía puede pagar', () => {
    // Sustituye al antiguo tope duro de unidades generadas. Ya no hace falta
    // un límite artificial: el límite es el dinero, igual que para el jugador.
    const session = new GameSession(1, 5);
    for (let i = 0; i < 400 / STEP; i++) {
      session.step(STEP);
      if (session.world.outcome) break;
    }

    const level = getLevel(1);
    const cheapest = Math.min(...level.enemyBuildable.map((id) => getUnitDef(id).cost));
    const vc = session.world.teams.VC;
    const bought = vc.totalSpawned - level.garrison.length;

    expect(bought * cheapest).toBeLessThanOrEqual(level.startingSupplies + vc.harvested);
  });
});

describe('Perfiles de dificultad', () => {
  const seeds = [1, 2, 3, 7, 13, 42, 99, 123, 777, 2024];

  /**
   * Nota importante sobre estas pruebas.
   *
   * El jugador ya no elige dificultad: la fija cada nivel de la campaña, para
   * que todos los alumnos compitan bajo las mismas condiciones. Y el techo de
   * población del nivel manda sobre el del perfil, así que dentro del nivel 1
   * los cuatro perfiles juegan con el mismo número máximo de unidades.
   *
   * Por eso aquí ya no se comprueba "más dificultad = menos victorias" —esa
   * comparación dejó de tener sentido cuando el nivel pasó a mandar—, sino que
   * los perfiles siguen ordenados por **criterio**, que es lo que de verdad
   * los distingue.
   */

  it('la apertura estándar gana de forma fiable en el nivel de entrada', () => {
    const wins = seeds.filter((seed) => playMatch(seed, standardPolicy, 'easy').won).length;
    expect(wins).toBeGreaterThanOrEqual(seeds.length - 2);
  });

  it('los perfiles están ordenados de peor a mejor criterio', () => {
    // Lo que hace difícil a un perfil no es tener más unidades, sino pensar
    // más a menudo, equivocarse menos y exigir menos ventaja para atacar.
    const easy = getAiProfile('easy');
    const normal = getAiProfile('normal');
    const hard = getAiProfile('hard');
    const impossible = getAiProfile('impossible');

    // Piensa cada vez más rápido.
    expect(easy.thinkInterval).toBeGreaterThan(normal.thinkInterval);
    expect(normal.thinkInterval).toBeGreaterThan(hard.thinkInterval);
    expect(hard.thinkInterval).toBeGreaterThan(impossible.thinkInterval);

    // Se equivoca cada vez menos.
    expect(easy.mistakeChance).toBeGreaterThan(normal.mistakeChance);
    expect(normal.mistakeChance).toBeGreaterThan(hard.mistakeChance);
    expect(impossible.mistakeChance).toBe(0);

    // Reacciona cada vez antes a una invasión.
    expect(easy.reactionDelay).toBeGreaterThan(impossible.reactionDelay);

    // Y admite ejércitos cada vez mayores.
    expect(easy.populationCap).toBeLessThan(impossible.populationCap);
  });

  it('ningún perfil le regala economía a la IA', () => {
    // La regla que gobierna el archivo de dificultad: se cambia el criterio,
    // nunca los recursos. Ambos bandos arrancan exactamente igual.
    for (const difficulty of ['easy', 'normal', 'hard', 'impossible'] as const) {
      const session = new GameSession(1, 42, true, 0, difficulty);
      expect(session.world.teams.VC.supplies).toBe(session.world.teams.US.supplies);
      expect(session.world.teams.VC.populationMax).toBe(session.world.teams.US.populationMax);
    }
  });

  it('ninguna dificultad deja una partida sin resolver', () => {
    for (const difficulty of ['easy', 'normal', 'hard', 'impossible'] as const) {
      for (const seed of [1, 42, 777]) {
        expect(playMatch(seed, standardPolicy, difficulty).timedOut).toBe(false);
        expect(playMatch(seed, greedyPolicy, difficulty).timedOut).toBe(false);
      }
    }
  });
});

describe('Rendimiento con ejércitos grandes', () => {
  it('sostiene 50 unidades por bando sin desplomarse', () => {
    // El tope de población subió de 12 a 50, así que hay que comprobar que el
    // paso de simulación aguanta el caso peor: cien unidades en pantalla,
    // todas empujándose y buscando blanco.
    const session = new GameSession(1, 77);
    const factory = new UnitFactory(getUnitDef);

    for (let i = 0; i < 50; i++) {
      factory.create(session.world, 'us_rifleman', 400 + (i % 10) * 6);
      factory.create(session.world, 'vc_guerrilla', 700 - (i % 10) * 6);
    }
    expect(session.world.units.length).toBeGreaterThanOrEqual(100);

    const started = performance.now();
    for (let i = 0; i < 600; i++) session.step(STEP); // 10 s de simulación
    const elapsed = performance.now() - started;

    // Diez segundos de juego deben simularse muy por debajo del tiempo real;
    // si esto se acerca a 10 000 ms, el navegador iría a tirones.
    expect(elapsed).toBeLessThan(4000);
  });

  it('mantiene las unidades dentro del carril y sin apilarse en un punto', () => {
    // La separación en dos dimensiones es lo que hace legible una formación
    // grande. Sin ella, las cincuenta unidades convergerían al mismo píxel.
    const session = new GameSession(1, 78);
    const factory = new UnitFactory(getUnitDef);
    for (let i = 0; i < 40; i++) factory.create(session.world, 'us_rifleman', 300);

    for (let i = 0; i < 300; i++) session.step(STEP);

    const ours = session.world.units.filter((u) => u.alive && u.team === 'US');
    const xs = ours.map((u) => u.transform.x);
    const spread = Math.max(...xs) - Math.min(...xs);

    // Ni amontonadas en un punto ni desplegadas por medio mapa.
    expect(spread).toBeGreaterThan(20);
    expect(spread).toBeLessThan(260);

    for (const unit of ours) {
      expect(Math.abs(unit.transform.y - 206)).toBeLessThanOrEqual(9.001);
    }
  });
});
