import { describe, expect, it } from 'vitest';
import { computeRoomStats } from '../../src/campaign/roomStats.js';
import {
  checkAdminPassword,
  isAdminRequested,
  studentLink,
  urlPassword,
} from '../../src/campaign/adminAccess.js';
import type { LobbySnapshot, Participant } from '../../src/campaign/ICompetition.js';
import { TOTAL_LEVELS } from '../../src/domain/balance/levels.js';

/**
 * El panel del profesor se proyecta delante de la clase, así que sus cifras se
 * comprueban aquí y no a ojo: un ganador mal elegido en pantalla es un premio
 * mal dado.
 */

function participant(
  name: string,
  levelsDone: number,
  seconds: number,
  finishedAt: number | null = null,
  defeats = 0,
): Participant {
  return {
    id: name,
    name,
    ready: true,
    joinedAt: 1000,
    score: { name, levelsDone, seconds, finishedAt, defeats, updatedAt: 2000 },
  };
}

function room(participants: Participant[]): LobbySnapshot {
  return { state: 'running', startedAt: 1000, participants };
}

describe('Cifras del panel del profesor', () => {
  it('el ganador es el primero que completó las tres operaciones', () => {
    // Dos alumnos terminan la campaña; gana quien la cerró antes por reloj
    // real, que es el criterio del premio anunciado en clase.
    const stats = computeRoomStats(
      room([
        participant('Ana Perez', TOTAL_LEVELS, 600, 9_000),
        participant('Luis Soto', TOTAL_LEVELS, 400, 5_000),
        participant('Mar Diaz', 2, 300),
      ]),
    );

    expect(stats.champion).toBe('Luis Soto');
    expect(stats.rows[0]?.name).toBe('Luis Soto');
    expect(stats.finished).toBe(2);
  });

  it('sin nadie terminado no hay ganador, pero sí clasificación', () => {
    const stats = computeRoomStats(
      room([participant('Ana Perez', 1, 200), participant('Luis Soto', 2, 500)]),
    );

    expect(stats.champion).toBeNull();
    // Más operaciones superadas manda sobre menos tiempo acumulado.
    expect(stats.rows[0]?.name).toBe('Luis Soto');
  });

  it('quien entró pero no ha jugado aparece igualmente', () => {
    // En una proyección, un alumno que no se ve en pantalla cree que el
    // sistema le ha perdido y deja de jugar.
    const snapshot: LobbySnapshot = {
      state: 'lobby',
      startedAt: null,
      participants: [{ id: 'x', name: 'Sin Jugar', ready: true, joinedAt: 10, score: null }],
    };
    const stats = computeRoomStats(snapshot);

    expect(stats.total).toBe(1);
    expect(stats.playing).toBe(0);
    expect(stats.rows[0]?.idle).toBe(true);
  });

  it('cuenta el avance del grupo, no solo el del primero', () => {
    const stats = computeRoomStats(
      room([
        participant('Ana Perez', 3, 600, 9_000, 1),
        participant('Luis Soto', 1, 120, null, 2),
        participant('Mar Diaz', 0, 0),
      ]),
    );

    expect(stats.levelsCleared).toBe(4);
    expect(stats.defeats).toBe(3);
    expect(stats.playing).toBe(1);
  });
});

describe('Acceso de administrador', () => {
  it('reconoce la petición del panel con y sin contraseña en la URL', () => {
    expect(isAdminRequested('?admin')).toBe(true);
    expect(isAdminRequested('?admin=RONKAGEI')).toBe(true);
    expect(isAdminRequested('?sala=1a')).toBe(false);
    expect(urlPassword('?admin=RONKAGEI')).toBe('RONKAGEI');
    expect(urlPassword('?admin')).toBe('');
  });

  it('la contraseña tolera espacios y mayúsculas, no otra palabra', () => {
    // La teclea una persona delante de la clase, a veces desde el teléfono.
    expect(checkAdminPassword('RONKAGEI')).toBe(true);
    expect(checkAdminPassword('  ronkagei ')).toBe(true);
    expect(checkAdminPassword('ronka')).toBe(false);
    expect(checkAdminPassword('')).toBe(false);
  });

  it('el enlace para la clase no arrastra el parámetro del panel', () => {
    expect(studentLink('https://pixelwar.app/?admin=RONKAGEI&sala=1a')).toBe(
      'https://pixelwar.app/?sala=1a',
    );
  });
});
