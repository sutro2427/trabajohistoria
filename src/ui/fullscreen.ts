/**
 * ============================================================================
 * PANTALLA COMPLETA — utilidades compartidas
 * ============================================================================
 *
 * Tres sitios piden pantalla completa (el botón de la esquina, la portada y el
 * menú de pausa), así que la lógica vive aquí y no duplicada en cada uno.
 *
 * Lo que hay que saber para que esto funcione de verdad en un teléfono:
 *
 *  · **Solo se puede pedir dentro de un gesto del usuario.** De ahí que sean
 *    botones y no algo automático al cargar.
 *  · **En iPhone no existe.** Safari en iOS no implementa la API de pantalla
 *    completa para elementos que no sean vídeo, y no hay forma de rodearlo. La
 *    única vía real es instalar la página desde *Compartir → Añadir a pantalla
 *    de inicio*: abierta desde el icono, el navegador no dibuja ni barra de
 *    direcciones ni barra de pestañas, que es exactamente lo que se busca. Por
 *    eso `installHint()` existe: donde no se puede, se explica cómo.
 *  · **Bloquear la orientación es un extra.** Si el navegador no deja, se
 *    juega igual y el aviso de "gira el teléfono" cubre el caso.
 */

/** `true` si el navegador permite poner la página a pantalla completa. */
export function fullscreenSupported(): boolean {
  return typeof document.documentElement.requestFullscreen === 'function';
}

/** `true` si ya está a pantalla completa. */
export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

/**
 * `true` si la página se abrió como aplicación instalada.
 *
 * Es el modo en el que iOS oculta toda su interfaz. Se comprueba de dos
 * formas porque Safari usa la suya propia (`navigator.standalone`) y no la
 * media query estándar.
 */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
}

/** Entra o sale de pantalla completa. Nunca lanza: el navegador puede negarse. */
export async function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });

    const orientation = screen.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    await orientation?.lock?.('landscape').catch(() => undefined);
  } catch {
    // Rechazado por política, permisos o iOS. No es un error del juego.
  }
}

/**
 * Instrucciones para ganar pantalla cuando el navegador no puede hacerlo solo.
 *
 * Devuelve `null` donde no hace falta decir nada: ya se está a pantalla
 * completa, o el botón funciona por sí mismo.
 *
 * El caso de iPhone se distingue del resto porque es el único en el que el
 * botón NO puede hacer nada y la solución está en el menú del navegador. Ahí
 * la instrucción no es un pie de página: es lo que todo el mundo va a
 * necesitar, así que se devuelve en piezas para poder presentarla como un
 * cartel y no como una nota al pie.
 */
export interface InstallHint {
  readonly title: string;
  readonly steps: readonly string[];
  readonly reward: string;
}

export function installHint(): InstallHint | null {
  if (isStandalone()) return null;

  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);

  if (isIos) {
    return {
      title: 'Para pantalla completa en iPhone',
      steps: [
        'Pulsa Compartir ⬆ abajo en Safari',
        'Elige "Añadir a pantalla de inicio"',
        'Abre PIXEL WAR desde ese icono',
      ],
      reward: 'Sin barras del navegador se gana casi el 40 % de pantalla.',
    };
  }

  if (!fullscreenSupported() && matchMedia('(pointer: coarse)').matches) {
    return {
      title: 'Para pantalla completa',
      steps: [
        'Abre el menú del navegador',
        'Elige "Añadir a pantalla de inicio" o "Instalar"',
        'Abre PIXEL WAR desde ese icono',
      ],
      reward: 'Sin barras del navegador se gana casi el 40 % de pantalla.',
    };
  }

  return null;
}
