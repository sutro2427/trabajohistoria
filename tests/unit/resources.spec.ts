import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';
import { WORLD } from '../../src/domain/balance/balance.js';
import { pickNodeFor, remainingSupplies } from '../../src/domain/world/ResourceNode.js';

const STEP = 1 / 60;

function run(session: GameSession, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps && !session.world.outcome; i++) session.step(STEP);
}

describe('Depósitos de suministros', () => {
  it('siembra cinco depósitos por bando, escalonados desde su base', () => {
    const { nodes } = new GameSession(1, 1).world;

    const us = nodes.filter((n) => n.team === 'US');
    const vc = nodes.filter((n) => n.team === 'VC');
    expect(us).toHaveLength(5);
    expect(vc).toHaveLength(5);

    // Ninguno comparte posición: la petición era repartirlos, no apilarlos.
    expect(new Set(nodes.map((n) => n.x)).size).toBe(nodes.length);

    // Cada bando los tiene por delante de su base, hacia el centro del mapa.
    for (const node of us) {
      expect(node.x).toBeGreaterThan(WORLD.usBaseX);
      expect(node.x).toBeLessThan(WORLD.battlefieldWidth * 0.5);
    }
    for (const node of vc) {
      expect(node.x).toBeLessThan(WORLD.vcBaseX);
      expect(node.x).toBeGreaterThan(WORLD.battlefieldWidth * 0.5);
    }
  });

  it('el mapa mide entre un 50 y un 60 % de lo que medía', () => {
    // El encargo era acortar entre un 40 y un 50 % la distancia entre bases.
    const distance = WORLD.vcBaseX - WORLD.usBaseX;
    const before = 1920;
    expect(distance / before).toBeGreaterThanOrEqual(0.5);
    expect(distance / before).toBeLessThanOrEqual(0.6);
    // Y sigue habiendo campo de sobra para pelear entre los depósitos de ambos.
    expect(distance).toBeGreaterThan(WORLD.logicalWidth * 2);
  });

  it('recolectar vacía el depósito y no crea suministros de la nada', () => {
    // Conservación estricta: cada suministro que entra en caja ha salido de un
    // depósito. Es lo que hace que el mapa sea un recurso finito y no un adorno.
    const session = new GameSession(1, 42);
    const world = session.world;
    const usNodes = world.nodes.filter((n) => n.team === 'US');
    const before = remainingSupplies(usNodes);

    session.trainUnit('us_harvester');
    run(session, 40);

    const extracted = before - remainingSupplies(usNodes);
    expect(extracted).toBeGreaterThan(0);
    expect(extracted).toBe(world.teams.US.harvested);
  });

  it('el recolector cambia de depósito cuando el suyo se agota', () => {
    const session = new GameSession(1, 5);
    const world = session.world;
    const usNodes = world.nodes.filter((n) => n.team === 'US');
    const nearest = usNodes[0];
    expect(nearest).toBeDefined();

    session.trainUnit('us_harvester');
    run(session, 6);

    const harvester = world.units.find((u) => u.defId === 'us_harvester');
    expect(harvester?.harvester?.nodeId).toBe(nearest?.id);

    // Se vacía a mano el depósito cercano, como habría hecho el propio trabajo.
    if (nearest) nearest.amount = 0;
    run(session, 20);

    // Sigue trabajando, pero en otro sitio: la economía se encarece, no se corta.
    expect(harvester?.alive).toBe(true);
    expect(harvester?.harvester?.nodeId).not.toBe(nearest?.id);
    expect(harvester?.harvester?.nodeId).not.toBe(0);
  });

  it('la producción por segundo baja al agotarse los depósitos cercanos', () => {
    // El efecto que se buscaba con los depósitos finitos: no un corte seco,
    // sino una economía que se va encareciendo y obliga a replantearse el mapa.
    const session = new GameSession(1, 8);
    session.trainUnit('us_harvester');
    run(session, 6);

    const full = session.incomePerSecond;
    expect(full).toBeGreaterThan(0);

    // Se agotan los dos bolsillos más cómodos del jugador.
    const usNodes = session.world.nodes.filter((n) => n.team === 'US');
    for (const node of usNodes.slice(0, 2)) node.amount = 0;
    run(session, 12);

    expect(session.incomePerSecond).toBeLessThan(full);
  });

  it('mantiene el ritmo económico de referencia con los depósitos llenos', () => {
    // La condición explícita del encargo: no tocar la velocidad de recolección
    // que ya funcionaba (≈1 suministro cada 2 segundos por recolector).
    const session = new GameSession(1, 42);
    const team = session.world.teams.US;

    session.trainUnit('us_harvester');
    run(session, 5); // aparece tras 4 s de entrenamiento y echa a andar

    const before = team.supplies;
    run(session, 18);
    const produced = team.supplies - before;

    // 18 s a un suministro cada ~1,7-2,1 s, y las entregas llegan de tres en
    // tres, así que el valor observado cae en esta horquilla.
    expect(produced).toBeGreaterThanOrEqual(6);
    expect(produced).toBeLessThanOrEqual(12);
  });

  it('cuando su bando se queda seco, el recolector busca en el resto del mapa', () => {
    const session = new GameSession(1, 13);
    const { nodes } = session.world;
    for (const node of nodes.filter((n) => n.team === 'US')) node.amount = 0;

    const chosen = pickNodeFor(nodes, 'US', WORLD.usBaseX);
    expect(chosen).toBeDefined();
    expect(chosen?.team).toBe('VC');
  });

  it('sin un suministro en el mapa no se elige ningún depósito', () => {
    const session = new GameSession(1, 14);
    for (const node of session.world.nodes) node.amount = 0;
    expect(pickNodeFor(session.world.nodes, 'US', WORLD.usBaseX)).toBeUndefined();
  });

  it('un recolector sin depósito disponible no bloquea la simulación', () => {
    // Es el caso límite de la partida muy larga: el mapa se agota. Debe
    // quedarse quieto, no entrar en un bucle de estados ni tumbar el bucle.
    const session = new GameSession(1, 15);
    session.trainUnit('us_harvester');
    run(session, 6);
    for (const node of session.world.nodes) node.amount = 0;

    expect(() => run(session, 20)).not.toThrow();
    const harvester = session.world.units.find((u) => u.defId === 'us_harvester');
    expect(harvester?.alive).toBe(true);
    expect(harvester?.harvester?.nodeId).toBe(0);
  });
});
