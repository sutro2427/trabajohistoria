/**
 * Bus de eventos tipado (patrón Observer).
 *
 * Es la costura que desacopla la simulación de todo lo demás: el dominio
 * *anuncia* lo que ocurre ("murió una unidad") y el render, la interfaz y el
 * audio *escuchan*. El dominio no sabe que existen — de ahí que pueda correr
 * en Node sin navegador.
 *
 * El genérico `TEvents` obliga a que el nombre del evento y la forma de su
 * carga útil coincidan en tiempo de compilación: publicar un evento con los
 * datos equivocados es un error de TypeScript, no un bug en producción.
 */

/** Función devuelta al suscribirse; invocarla cancela la suscripción. */
export type Unsubscribe = () => void;

type Listener<T> = (payload: T) => void;

export class EventBus<TEvents extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof TEvents, Set<Listener<never>>>();

  /** Registra un oyente. Devuelve la función para darse de baja. */
  on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set!.delete(listener as Listener<never>);
    };
  }

  /** Registra un oyente que se da de baja tras la primera notificación. */
  once<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  /**
   * Publica un evento.
   *
   * Se itera sobre una copia porque un oyente puede darse de baja (o dar de
   * alta a otro) durante la notificación, y mutar el Set mientras se recorre
   * produciría un comportamiento impredecible.
   */
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const listener of [...set]) {
      (listener as Listener<TEvents[K]>)(payload);
    }
  }

  /** Elimina los oyentes de un evento, o todos si no se indica ninguno. */
  clear<K extends keyof TEvents>(event?: K): void {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
  }

  /** Número de oyentes registrados para un evento (útil en tests). */
  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
