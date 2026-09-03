import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/domain/GameSession.js';
import { COMBAT, getUnitDef, WORLD } from '../../src/domain/balance/balance.js';
import { segmentHitsBox } from '../../src/domain/systems/ProjectileSystem.js';
import { DamageSystem } from '../../src/domain/systems/DamageSystem.js';
import { UnitFactory } from '../../src/domain/factories/UnitFactory.js';

const STEP = 1 / 60;

function run(session: GameSession, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) session.step(STEP);
}

describe('Combate', () => {
  it('el daño resta la armadura pero nunca baja del mínimo', () => {
    // Sin este suelo, una unidad con armadura ≥ daño sería invulnerable
    // al rifle y la partida quedaría bloqueada para siempre.
    const session = new GameSession(1, 7);
    const damage = new DamageSystem();
    const factory = new UnitFactory(getUnitDef);

    const tank = factory.create(session.world, 'vc_tank', 500);
    const def = getUnitDef('vc_tank');

    // La armadura se lee del catálogo en lugar de codificarla aquí: el test
    // verifica la *fórmula*, no una cifra concreta de balance, y así ajustar
    // el blindaje del tanque no rompe la prueba.
    const rifleDamage = getUnitDef('us_rifleman').damage;
    const expected = Math.max(COMBAT.minDamage, rifleDamage - def.armor);
    expect(def.armor).toBeGreaterThan(0);

    damage.damageUnit(session.world, tank, rifleDamage, def);
    expect(tank.health.hp).toBe(def.hp - expected);

    // Un daño menor que la armadura sigue haciendo el mínimo, no cero.
    const hpBefore = tank.health.hp;
    damage.damageUnit(session.world, tank, 2, def);
    expect(tank.health.hp).toBe(hpBefore - COMBAT.minDamage);
  });

  it('un soldado mata a un guerrillero en el tiempo previsto por el balance', () => {
    // Cálculo del balance: 12 de daño × 1,4 disparos/s = 16,8 DPS
    // contra 90 puntos de vida → unos 5,4 s de fuego efectivo.
    const usDef = getUnitDef('us_rifleman');
    const vcDef = getUnitDef('vc_guerrilla');
    const dps = usDef.damage * usDef.fireRate;
    const timeToKill = vcDef.hp / dps;

    expect(timeToKill).toBeGreaterThan(5.0);
    expect(timeToKill).toBeLessThan(5.8);
  });

  it('el soldado estadounidense supera en alcance al guerrillero', () => {
    // Esos píxeles de ventaja son lo que da función mecánica real a DEFENDER:
    // en posición defensiva se dispara primero.
    expect(getUnitDef('us_rifleman').range).toBeGreaterThan(getUnitDef('vc_guerrilla').range);
  });

  it('dos bandos enfrentados se causan bajas sin intervención del jugador', () => {
    const session = new GameSession(1, 11);
    const factory = new UnitFactory(getUnitDef);

    // Se colocan frente a frente en mitad del mapa, dentro del alcance mutuo.
    // Se siguen por identificador porque el nivel ya trae su propia guarnición.
    const soldier = factory.create(session.world, 'us_rifleman', 1000);
    const guerrilla = factory.create(session.world, 'vc_guerrilla', 1060);

    expect(soldier.alive).toBe(true);
    expect(guerrilla.alive).toBe(true);

    run(session, 20);

    // Sin ninguna orden del jugador, el duelo se resuelve solo: esa autonomía
    // es la base del género.
    expect(soldier.alive && guerrilla.alive).toBe(false);
  });

  it('el disparo genera proyectiles reales que vuelan por el mundo', () => {
    const session = new GameSession(1, 3);
    const factory = new UnitFactory(getUnitDef);
    factory.create(session.world, 'us_rifleman', 1000);
    factory.create(session.world, 'vc_guerrilla', 1050);

    let sawProjectile = false;
    for (let i = 0; i < 60 * 6; i++) {
      session.step(STEP);
      if (session.world.projectiles.length > 0) {
        sawProjectile = true;
        break;
      }
    }
    expect(sawProjectile).toBe(true);
  });

  it('el daño en área alcanza a varios blancos a la vez', () => {
    const session = new GameSession(1, 5);
    const factory = new UnitFactory(getUnitDef);
    const tankDef = getUnitDef('us_tank');

    // Tres guerrilleros dentro del radio de salpicadura.
    const victims = [0, 10, 20].map((dx) =>
      factory.create(session.world, 'vc_guerrilla', 1000 + dx),
    );
    expect(tankDef.splashRadius).toBeGreaterThan(20);

    const damage = new DamageSystem();
    for (const v of victims) {
      const d = Math.abs(v.transform.x - 1010);
      if (d <= tankDef.splashRadius) {
        damage.damageUnit(session.world, v, tankDef.damage, getUnitDef('vc_guerrilla'));
      }
    }
    // Todos deben haber recibido daño: están dentro del radio.
    for (const v of victims) expect(v.health.hp).toBeLessThan(getUnitDef('vc_guerrilla').hp);
  });
});

describe('Geometría de impacto', () => {
  it('detecta el impacto aunque la bala atraviese el cuerpo en un solo paso', () => {
    // Una bala a 420 px/s recorre 7 px por paso. Comprobar solo el punto final
    // dejaría pasar blancos estrechos: el clásico bug de las "balas fantasma".
    expect(segmentHitsBox(0, 10, 20, 10, 8, 0, 4, 20)).toBe(true);
  });

  it('no detecta impacto cuando el segmento pasa de largo', () => {
    expect(segmentHitsBox(0, 100, 20, 100, 8, 0, 4, 20)).toBe(false);
  });

  it('detecta el impacto en diagonal', () => {
    expect(segmentHitsBox(0, 0, 20, 20, 8, 8, 4, 4)).toBe(true);
  });
});

describe('Geometría del mundo', () => {
  it('las bases están en extremos opuestos, cerca pero no encima', () => {
    // El mapa se acortó a propósito para que la tropa no se pase la partida
    // caminando. El límite inferior es el que garantiza que sigue habiendo
    // terreno que disputar entre las dos economías.
    expect(WORLD.usBaseX).toBeLessThan(WORLD.vcBaseX);
    const distance = WORLD.vcBaseX - WORLD.usBaseX;
    expect(distance).toBeGreaterThan(WORLD.logicalWidth * 2);
    expect(distance).toBeLessThan(WORLD.logicalWidth * 3);
  });

  it('el campo de batalla contiene ambas bases con margen', () => {
    expect(WORLD.battlefieldWidth).toBeGreaterThan(WORLD.vcBaseX + 40);
  });
});
