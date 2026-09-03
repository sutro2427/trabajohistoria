/**
 * ============================================================================
 * ACCESO DE ADMINISTRADOR
 * ============================================================================
 *
 * El profesor entra al panel con `?admin` en la URL y escribe una contraseña.
 *
 * **Qué protege esto y qué no.** La comprobación ocurre en el navegador, así
 * que la contraseña viaja dentro del paquete que se descarga cualquiera: un
 * alumno con la consola abierta puede encontrarla. Es, y se documenta como
 * tal, una barrera de conveniencia — evita que alguien entre por curiosidad o
 * por accidente al panel que se está proyectando.
 *
 * Lo que de verdad impide manipular la competencia son las reglas de
 * Firestore (`firestore.rules`), que se aplican en el servidor. Si en algún
 * momento hiciera falta una barrera real, el sitio correcto es ahí — nunca
 * aquí.
 */

/**
 * Contraseña por defecto del panel.
 *
 * Se puede sustituir por despliegue con `VITE_ADMIN_KEY` sin tocar el código;
 * el valor por defecto existe para que el panel funcione recién clonado el
 * repositorio y sin configurar nada.
 */
const DEFAULT_PASSWORD = 'RONKAGEI';

/** Clave donde se recuerda la sesión abierta, para no repreguntar al recargar. */
const SESSION_KEY = 'pixelwar:admin';

/** Contraseña vigente en este despliegue. */
export function adminPassword(): string {
  const configured = import.meta.env['VITE_ADMIN_KEY'];
  return typeof configured === 'string' && configured.length > 0 ? configured : DEFAULT_PASSWORD;
}

/**
 * `true` si la URL pide el panel.
 *
 * Se acepta tanto `?admin` a secas —la forma que se teclea en clase— como
 * `?admin=<contraseña>`, que sirve para dejar preparado un enlace directo en
 * el ordenador de la proyección.
 */
export function isAdminRequested(search: string = window.location.search): boolean {
  return new URLSearchParams(search).has('admin');
}

/** Contraseña que venga ya escrita en la URL, si la hay. */
export function urlPassword(search: string = window.location.search): string {
  return new URLSearchParams(search).get('admin') ?? '';
}

/**
 * Compara la contraseña introducida.
 *
 * Se normalizan espacios y mayúsculas porque la va a teclear una persona
 * delante de una clase, a veces desde un teléfono con autocorrector: fallar
 * por un espacio final sería una molestia sin ninguna contrapartida.
 */
export function checkAdminPassword(input: string): boolean {
  return input.trim().toUpperCase() === adminPassword().trim().toUpperCase();
}

/** Recuerda que esta pestaña ya está autenticada. */
export function rememberAdminSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Navegación privada o almacenamiento bloqueado: se vuelve a preguntar.
  }
}

/** `true` si esta pestaña ya se autenticó antes de recargar. */
export function hasAdminSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Cierra la sesión de administrador de esta pestaña. */
export function forgetAdminSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nada que limpiar si no se pudo guardar.
  }
}

/**
 * Enlace que se reparte a la clase: la misma dirección sin el parámetro del
 * panel. Se muestra en pantalla para poder dictarlo mientras se proyecta.
 */
export function studentLink(href: string = window.location.href): string {
  try {
    const url = new URL(href);
    url.searchParams.delete('admin');
    return url.toString();
  } catch {
    return href;
  }
}
