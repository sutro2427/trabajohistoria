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
 * Instrucción para ganar pantalla en este dispositivo, o cadena vacía si no
 * hace falta decir nada.
 *
 * Se distingue el caso de iOS porque es el único en el que el botón no puede
 * hacer nada y la solución está en el menú del navegador, no en el juego.
 */
export function installHint(): string {
  if (isStandalone()) return '';

  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);

  if (isIos) {
    return 'Para jugar a pantalla completa: pulsa Compartir (⬆) y elige "Añadir a pantalla de inicio". Luego abre el juego desde ese icono.';
  }
  if (!fullscreenSupported() && matchMedia('(pointer: coarse)').matches) {
    return 'Para jugar a pantalla completa, instala el juego desde el menú del navegador ("Añadir a pantalla de inicio").';
  }
  return '';
}
