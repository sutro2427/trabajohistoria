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
  constructor(private readonly key = 'operacion-delta:progress:v1') {}

  load(): Progress {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return initialProgress();
      const parsed = JSON.parse(raw) as Partial<Progress>;
      // Se fusiona con los valores por defecto: así una versión guardada por
      // una build antigua, a la que le falten campos nuevos, sigue siendo válida.
      return { ...initialProgress(), ...parsed };
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
