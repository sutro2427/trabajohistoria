import { describe, expect, it } from 'vitest';
import {
  compareEntries,
  createRun,
  isComplete,
  rankEntries,
  recordDefeat,
  recordVictory,
  summarize,
  toScoreEntry,
  type LevelResult,
  type ScoreEntry,
} from '../../src/campaign/CampaignRun.js';
import { TOTAL_LEVELS } from '../../src/domain/balance/levels.js';

function result(level: number, over: Partial<LevelResult> = {}): LevelResult {
  return {
    level,
    seconds: 100,
    harvested: 200,
    leftover: 20,
    losses: 5,
    kills: 15,
    spentOnPowers: 0,
    ...over,
  };
}

describe('Progreso de campaña', () => {
  it('avanza de nivel al ganar y marca el final al completar los tres', () => {
    const run = createRun('Ana Rojas', 1000);
    expect(run.currentLevel).toBe(1);

    recordVictory(run, result(1), 2000);
    expect(run.currentLevel).toBe(2);
    expect(isComplete(run)).toBe(false);

    recordVictory(run, result(2), 3000);
    expect(run.currentLevel).toBe(3);

    recordVictory(run, result(3), 4000);
    expect(isComplete(run)).toBe(true);
    // La marca de tiempo del final es la que decide quién gana el premio.
    expect(run.finishedAt).toBe(4000);
  });

  it('las derrotas no hacen retroceder de nivel', () => {
    const run = createRun('Ana Rojas');
    recordVictory(run, result(1));
    recordDefeat(run);
    recordDefeat(run);

    expect(run.currentLevel).toBe(2);
    expect(run.defeats).toBe(2);
  });

  it('el porcentaje de eficiencia nunca se sale de 0 a 100', () => {
    // Regresión: con el botín del nivel anterior sumado a los suministros, el
    // sobrante podía superar lo recolectado y la pantalla final llegó a
    // mostrar "-64 % de eficiencia" y "164 % sin usar".
    const run = createRun('Ana Rojas');
    recordVictory(run, result(1, { harvested: 100, leftover: 900 }));

    const summary = summarize(run);
    expect(summary.efficiency).toBeGreaterThanOrEqual(0);
    expect(summary.efficiency).toBeLessThanOrEqual(100);
  });

  it('resume la gestión de toda la campaña', () => {
    const run = createRun('Ana Rojas');
    recordVictory(run, result(1, { harvested: 100, leftover: 10, kills: 20, losses: 4 }));
    recordVictory(run, result(2, { harvested: 100, leftover: 10, kills: 20, losses: 4 }));

    const summary = summarize(run);
    expect(summary.harvested).toBe(200);
    expect(summary.leftover).toBe(20);
    expect(summary.efficiency).toBe(90);
    expect(summary.exchangeRatio).toBe(5);
    expect(summary.seconds).toBe(200);
  });

  it('no divide por cero cuando no hubo bajas propias', () => {
    const run = createRun('Ana Rojas');
    recordVictory(run, result(1, { losses: 0, kills: 7 }));
    expect(summarize(run).exchangeRatio).toBe(7);
  });
});

describe('Orden de la tabla de posiciones', () => {
  const entry = (over: Partial<ScoreEntry>): ScoreEntry => ({
    name: 'X',
    levelsDone: 0,
    seconds: 0,
    finishedAt: null,
    defeats: 0,
    updatedAt: 0,
    ...over,
  });

  it('quien ha completado más niveles va primero', () => {
    const a = entry({ name: 'A', levelsDone: 3, finishedAt: 9000 });
    const b = entry({ name: 'B', levelsDone: 2 });
    expect(rankEntries([b, a])[0]?.name).toBe('A');
  });

  it('a igualdad de niveles, gana quien terminó antes', () => {
    // Es el criterio del premio: el primer alumno que complete los tres.
    const first = entry({ name: 'Primero', levelsDone: TOTAL_LEVELS, finishedAt: 1000 });
    const second = entry({ name: 'Segundo', levelsDone: TOTAL_LEVELS, finishedAt: 2000 });
    expect(rankEntries([second, first])[0]?.name).toBe('Primero');
  });

  it('quien ha terminado va por delante de quien sigue jugando', () => {
    const done = entry({ name: 'Terminó', levelsDone: 2, finishedAt: 5000 });
    const playing = entry({ name: 'Jugando', levelsDone: 2, seconds: 10 });
    expect(compareEntries(done, playing)).toBeLessThan(0);
  });

  it('sin nadie terminado, ordena por tiempo y luego por derrotas', () => {
    const rapido = entry({ name: 'Rápido', levelsDone: 1, seconds: 90 });
    const lento = entry({ name: 'Lento', levelsDone: 1, seconds: 150 });
    const empatado = entry({ name: 'Empatado', levelsDone: 1, seconds: 90, defeats: 3 });

    const ranked = rankEntries([lento, empatado, rapido]);
    expect(ranked.map((e) => e.name)).toEqual(['Rápido', 'Empatado', 'Lento']);
  });

  it('ordenar no altera el array original', () => {
    const list = [entry({ name: 'A', levelsDone: 1 }), entry({ name: 'B', levelsDone: 3 })];
    rankEntries(list);
    expect(list[0]?.name).toBe('A');
  });

  it('publica el progreso en el formato compacto de la tabla', () => {
    const run = createRun('Ana Rojas');
    recordVictory(run, result(1, { seconds: 120 }));
    const score = toScoreEntry(run, 7777);

    expect(score.name).toBe('Ana Rojas');
    expect(score.levelsDone).toBe(1);
    expect(score.seconds).toBe(120);
    expect(score.updatedAt).toBe(7777);
  });
});
