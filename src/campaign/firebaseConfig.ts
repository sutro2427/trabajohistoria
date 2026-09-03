/**
 * Configuración de Firebase, leída de variables de entorno.
 *
 * Las claves de un proyecto Firebase web **no son secretas**: viajan en el
 * paquete que se descarga el navegador y están pensadas para ser públicas. Lo
 * que protege los datos son las reglas de seguridad de Firestore, no ocultar
 * la configuración. Aun así se leen del entorno y no se escriben en el código
 * para poder cambiar de proyecto sin recompilar y para no publicarlas en el
 * repositorio.
 *
 * Se definen en Netlify (Site settings → Environment variables) o en un
 * archivo `.env.local` para desarrollo. Sin ellas, el juego arranca en modo
 * local: sigue siendo jugable, solo que sin panel compartido.
 */
export interface FirebaseSettings {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
  readonly storageBucket?: string;
  readonly messagingSenderId?: string;
}

/** Devuelve la configuración si está completa, o `null` si falta algo. */
export function readFirebaseSettings(): FirebaseSettings | null {
  const env = import.meta.env;
  const apiKey = env['VITE_FIREBASE_API_KEY'];
  const authDomain = env['VITE_FIREBASE_AUTH_DOMAIN'];
  const projectId = env['VITE_FIREBASE_PROJECT_ID'];
  const appId = env['VITE_FIREBASE_APP_ID'];

  // Todo o nada: una configuración a medias falla en tiempo de ejecución con
  // un error opaco, y es mucho mejor caer al modo local de forma limpia.
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: env['VITE_FIREBASE_STORAGE_BUCKET'],
    messagingSenderId: env['VITE_FIREBASE_MESSAGING_SENDER_ID'],
  };
}

/**
 * Identificador de la sala.
 *
 * Se toma de `?sala=` para que el profesor pueda abrir una sala nueva por
 * curso simplemente cambiando el enlace que comparte. Sin parámetro, todos
 * caen en la misma sala.
 */
export function readRoomId(search: string = window.location.search): string {
  const raw = new URLSearchParams(search).get('sala') ?? 'clase';
  // Se sanea porque va directo a una ruta de Firestore.
  const clean = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
  return clean.length > 0 ? clean : 'clase';
}

/** Clave de administrador tomada de la URL (`?admin=...`). */
export function readAdminKey(search: string = window.location.search): string | null {
  return new URLSearchParams(search).get('admin');
}

/**
 * Tiempo de vida de los datos de una sala: una hora.
 *
 * Cumple el requisito de que la información de cada alumno no persista. Se
 * aplica de dos formas complementarias: el cliente ignora todo lo que esté
 * caducado (efecto inmediato y sin depender del servidor) y una política de
 * TTL de Firestore sobre el campo `expiresAt` lo borra de verdad.
 */
export const ROOM_TTL_MS = 60 * 60 * 1000;
