/**
 * ============================================================================
 * VALIDACIÓN DEL NOMBRE DEL JUGADOR
 * ============================================================================
 *
 * El nombre no es un adorno: es la identidad con la que se adjudica el premio
 * delante de toda la clase. Por eso se exige que sea real, único y presentable.
 *
 * El filtro de contenido es deliberadamente conservador. Se prefiere rechazar
 * algún nombre legítimo raro —el alumno simplemente escribe otro— antes que
 * dejar pasar una grosería que acabe proyectada en la pizarra.
 */

/** Motivo por el que un nombre no se acepta. */
export type NameRejection =
  | 'empty'
  | 'tooShort'
  | 'tooLong'
  | 'invalidChars'
  | 'noSurname'
  | 'offensive'
  | 'taken';

export interface NameCheck {
  readonly ok: boolean;
  readonly reason?: NameRejection;
  /** Mensaje ya redactado para mostrar al alumno. */
  readonly message?: string;
  /** Nombre normalizado que debe guardarse si es válido. */
  readonly value: string;
}

export const NAME_MIN = 3;
export const NAME_MAX = 24;

/**
 * Raíces de palabras malsonantes u ofensivas en español (y algunas en inglés).
 *
 * Se comparan contra el nombre con los acentos quitados y los caracteres que
 * suelen usarse para disfrazarlas ya sustituidos (4→a, 3→e, 1→i, 0→o, $→s),
 * porque el truco evidente de un alumno es escribir "p3ndejo".
 */
const OFFENSIVE_ROOTS: readonly string[] = [
  'puta', 'puto', 'mierd', 'joder', 'polla', 'verga', 'pendej', 'cabron',
  'concha', 'conchetumare', 'ctm', 'culia', 'culea', 'weon', 'huevon', 'gil',
  'maricon', 'marica', 'zorra', 'perra', 'pito', 'pene', 'vagina', 'teta',
  'culo', 'caca', 'pedo', 'coger', 'follar', 'chupa', 'chupala', 'mamon',
  'mamada', 'imbecil', 'idiota', 'estupid', 'tarado', 'retard', 'subnormal',
  'fuck', 'shit', 'bitch', 'dick', 'cunt', 'asshole', 'nigg', 'whore', 'slut',
  'nazi', 'hitler', 'violad', 'matar', 'droga', 'cocain', 'sexo', 'porn',
  'admin', 'null', 'undefined', 'anonimo', 'anonymous',
];

/** Nombres que no identifican a nadie y no sirven para adjudicar un premio. */
const PLACEHOLDER_NAMES: readonly string[] = [
  'test', 'prueba', 'asdf', 'qwerty', 'aaaa', 'xxxx', 'jugador', 'player',
  'usuario', 'user', 'nadie', 'nn', 'sin nombre', 'profe', 'profesor',
];

/** Quita acentos y deja el texto en minúsculas para comparar. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Deshace las sustituciones típicas para camuflar palabras. */
function deleet(value: string): string {
  return value
    .replace(/[4@]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
}

/** Limpia espacios repetidos y recorta. */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Comprueba un nombre.
 *
 * @param taken Nombres ya usados en esta sesión, normalizados por el llamante
 *              o no: la comparación se hace sin acentos ni mayúsculas para que
 *              "José Pérez" y "jose perez" cuenten como el mismo.
 */
export function checkName(raw: string, taken: readonly string[] = []): NameCheck {
  const value = normalizeName(raw);

  if (value.length === 0) {
    return { ok: false, reason: 'empty', message: 'Escribe tu nombre para entrar.', value };
  }

  if (value.length < NAME_MIN) {
    return {
      ok: false,
      reason: 'tooShort',
      message: `El nombre debe tener al menos ${NAME_MIN} letras.`,
      value,
    };
  }

  if (value.length > NAME_MAX) {
    return {
      ok: false,
      reason: 'tooLong',
      message: `El nombre no puede pasar de ${NAME_MAX} caracteres.`,
      value,
    };
  }

  // Solo letras (con acentos y ñ), espacios, guiones y apóstrofos: los nombres
  // reales caben aquí y los adornos de teclado no.
  if (!/^[\p{L}][\p{L}\s'’-]*$/u.test(value)) {
    return {
      ok: false,
      reason: 'invalidChars',
      message: 'Usa solo letras y espacios, sin números ni símbolos.',
      value,
    };
  }

  const flat = deleet(normalize(value));

  for (const root of OFFENSIVE_ROOTS) {
    if (flat.includes(root)) {
      return {
        ok: false,
        reason: 'offensive',
        message: 'Ese nombre no se puede usar. Escribe tu nombre real.',
        value,
      };
    }
  }

  // Se comprueba palabra por palabra además del nombre completo: "test test"
  // pasaba el filtro porque la lista contiene "test" pero no la frase entera.
  const normalized = normalize(value);
  const parts = normalized.split(' ');
  const isPlaceholder =
    PLACEHOLDER_NAMES.includes(normalized) ||
    parts.every((word) => PLACEHOLDER_NAMES.includes(word)) ||
    // Letras repetidas como "aaaa" o "xxxx" en cualquier posición.
    parts.some((word) => word.length >= 3 && /^(.)\1+$/.test(word));

  if (isPlaceholder) {
    return {
      ok: false,
      reason: 'offensive',
      message: 'Escribe tu nombre real, no un nombre de prueba.',
      value,
    };
  }

  // Nombre y apellido: es lo que permite distinguir a dos "Diego" de la misma
  // clase, y lo que hace que el ranking proyectado signifique algo.
  const words = value.split(' ').filter((w) => w.length >= 2);
  if (words.length < 2) {
    return {
      ok: false,
      reason: 'noSurname',
      message: 'Escribe tu nombre y tu apellido (por ejemplo: Ana Rojas).',
      value,
    };
  }

  const key = normalize(value);
  if (taken.some((t) => normalize(t) === key)) {
    return {
      ok: false,
      reason: 'taken',
      message: 'Ese nombre ya está en uso. Añade tu segundo apellido o inicial.',
      value,
    };
  }

  return { ok: true, value };
}

/** Clave estable para comparar nombres entre sí y como identificador. */
export function nameKey(value: string): string {
  return normalize(normalizeName(value)).replace(/[^a-z0-9]/g, '-');
}
