import { describe, expect, it } from 'vitest';
import { checkName, nameKey, normalizeName } from '../../src/campaign/nameValidation.js';

describe('Validación del nombre del jugador', () => {
  it('acepta un nombre y apellido normales', () => {
    for (const name of ['Ana Rojas', 'José Pérez', "Diego O'Brien", 'María del Carmen Silva']) {
      expect(checkName(name).ok, name).toBe(true);
    }
  });

  it('exige apellido', () => {
    // Sin apellido no se puede distinguir a dos alumnos con el mismo nombre,
    // y eso importa cuando hay un premio en juego.
    const result = checkName('Diego');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('noSurname');
  });

  it('rechaza nombres ofensivos', () => {
    for (const name of ['Puta Madre', 'El Weon Rojas', 'Fuck You']) {
      const result = checkName(name);
      expect(result.ok, name).toBe(false);
      expect(result.reason, name).toBe('offensive');
    }
  });

  it('rechaza groserías camufladas con números', () => {
    // El truco evidente de un alumno es escribir "p3ndejo" para colarla.
    const result = checkName('P3ndejo Lopez');
    expect(result.ok).toBe(false);
  });

  it('rechaza nombres de relleno', () => {
    expect(checkName('test test').ok).toBe(false);
    expect(checkName('asdf asdf').ok).toBe(false);
  });

  it('rechaza números y símbolos', () => {
    const result = checkName('Ana123 Rojas');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalidChars');
  });

  it('rechaza nombres demasiado cortos o largos', () => {
    // 'Ab' tiene dos caracteres: por debajo del mínimo.
    expect(checkName('Ab').reason).toBe('tooShort');
    expect(checkName('Aaaaaaaaaa Bbbbbbbbbbbbbbbbbb').reason).toBe('tooLong');
  });

  it('detecta un nombre ya usado sin importar acentos ni mayúsculas', () => {
    const result = checkName('jose perez', ['José Pérez']);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('taken');
  });

  it('normaliza los espacios sobrantes', () => {
    expect(normalizeName('  Ana   Rojas  ')).toBe('Ana Rojas');
    expect(checkName('  Ana   Rojas  ').value).toBe('Ana Rojas');
  });

  it('genera la misma clave para variantes del mismo nombre', () => {
    expect(nameKey('José Pérez')).toBe(nameKey('  jose   perez '));
  });
});
