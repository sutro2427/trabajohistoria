import { isDifficultyId } from '../domain/balance/difficulty.js';
import type { IProgressRepository } from './IProgressRepository.js';
import { initialProgress, type Progress } from './Progress.js';

/**
 * Guarda el progreso en el navegador.
 *
 * Todo acceso va envuelto en `try/catch` porque `localStorage` lanza excepción
 * en varias situaciones reales y perfectamente normales: navegación privada en
 * algunos navegadores, cuota agotada, o cookies de terceros bloqueadas cuando
 * la página se sirve dentro de un iframe. Perder el progreso guardado es
 * molesto; que el juego no arranque por ello sería mucho peor.
 */
export class LocalStorageProgressRepository implements IProgressRepository {
  /**
   * La clave conserva el nombre en clave original del proyecto a propósito:
   * cambiarla al renombrar el juego borraría el progreso ya guardado en el
   * navegador de quien lo estuviera jugando. Un identificador de
   * almacenamiento es un dato, no un rótulo.
   */
  constructor(private readonly key = 'operacion-delta:progress:v1') {}

  load(): Progress {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return initialProgress();
      const parsed = JSON.parse(raw) as Partial<Progress>;
      // Se fusiona con los valores por defecto: así una versión guardada por
      // una build antigua, a la que le falten campos nuevos, sigue siendo válida.
      const merged = { ...initialProgress(), ...parsed };
      // El disco es entrada no confiable: una dificultad que ya no exista
      // (o un valor manipulado a mano) haría fallar el catálogo al arrancar.
      if (!isDifficultyId(merged.difficulty)) merged.difficulty = 'normal';
      merged.savedRun = sanitizeRun(merged.savedRun);
      return merged;
    } catch {
      return initialProgress();
    }
  }

  save(progress: Progress): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(progress));
    } catch {
      // Sin almacenamiento disponible: la partida en curso sigue siendo jugable.
    }
  }

  reset(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* Nada que hacer. */
    }
  }
}

/**
 * Valida la campaña guardada antes de devolverla.
 *
 * El almacenamiento local es entrada no confiable: lo escribe el navegador del
 * alumno y se puede editar a mano en dos clics. Un `currentLevel` fuera de
 * rango o un `results` que no fuera un array reventarían el arranque con un
 * error opaco, y el alumno solo vería una pantalla en blanco justo cuando la
 * clase está empezando. Ante cualquier duda se descarta el intento guardado,
 * que en el peor caso cuesta repetir una operación.
 */
function sanitizeRun(run: Progress['savedRun']): Progress['savedRun'] {
  if (!run || typeof run !== 'object') return null;
  if (typeof run.playerName !== 'string' || run.playerName.length === 0) return null;
  if (!Array.isArray(run.results)) return null;
  if (!Number.isFinite(run.currentLevel) || run.currentLevel < 1) return null;
  // Una campaña ya terminada no es un intento a medias: no hay nada que retomar.
  if (run.finishedAt !== null && run.finishedAt !== undefined) return null;
  return run;
}
