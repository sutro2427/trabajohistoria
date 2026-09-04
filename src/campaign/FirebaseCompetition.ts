import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';

import type { ScoreEntry } from './CampaignRun.js';
import type {
  ICompetition,
  LobbySnapshot,
  LobbyState,
  Participant,
  Unsubscribe,
} from './ICompetition.js';
import { nameKey } from './nameValidation.js';
import { ROOM_TTL_MS, type FirebaseSettings } from './firebaseConfig.js';

/**
 * ============================================================================
 * COMPETENCIA EN VIVO SOBRE FIRESTORE
 * ============================================================================
 *
 * Estructura de datos en Firestore:
 *
 *   rooms/{roomId}                      ← estado de la sala y salida
 *   rooms/{roomId}/players/{nameKey}    ← un documento por alumno
 *   archive/{runId}                     ← historial permanente, solo lectura del admin
 *
 * Decisiones que conviene entender:
 *
 * **El identificador del alumno es su nombre normalizado.** Eso hace que la
 * unicidad del nombre la garantice la propia base de datos: dos alumnos que
 * escriban "Ana Rojas" chocan en el mismo documento y el segundo es
 * rechazado, sin necesidad de una comprobación aparte que podría llegar tarde.
 *
 * **Los datos de la sala caducan a la hora**, y hacen falta dos campos para
 * conseguirlo:
 *
 *   · `expiresAt` es un número de milisegundos y lo usa el cliente para
 *     descartar lo caducado nada más leerlo. Es lo que da efecto inmediato sin
 *     depender de que el servidor haya pasado a limpiar.
 *   · `expiresAtTs` es el mismo instante como `Timestamp`, y existe solo para
 *     la política de TTL de Firestore, que **exige un Timestamp** y no acepta
 *     un número. Sin este campo la sala se veía vacía a la hora pero los
 *     documentos se quedaban en la base de datos para siempre.
 *
 * **El archivo histórico es aparte y no caduca.** Cuando un alumno completa la
 * campaña se escribe una copia en `archive/`, que solo el profesor consulta.
 */
/**
 * Los dos campos de caducidad que lleva todo documento de sala.
 *
 * Van siempre juntos: uno para el cliente y otro para la política de TTL del
 * servidor. Se genera aquí para que no se pueda escribir uno y olvidar el otro.
 */
function expiryFields(now: number): { expiresAt: number; expiresAtTs: Timestamp } {
  const at = now + ROOM_TTL_MS;
  return { expiresAt: at, expiresAtTs: Timestamp.fromMillis(at) };
}

export class FirebaseCompetition implements ICompetition {
  readonly online = true;
  readonly offlineReason = null;

  private readonly app: FirebaseApp;
  private readonly db: Firestore;
  private readonly auth: Auth;
  private readonly roomId: string;

  private playerId: string | null = null;
  private playerName = '';
  private readonly unsubscribers: Unsubscribe[] = [];

  constructor(settings: FirebaseSettings, roomId: string) {
    this.app = initializeApp({
      apiKey: settings.apiKey,
      authDomain: settings.authDomain,
      projectId: settings.projectId,
      appId: settings.appId,
      ...(settings.storageBucket ? { storageBucket: settings.storageBucket } : {}),
      ...(settings.messagingSenderId ? { messagingSenderId: settings.messagingSenderId } : {}),
    });
    this.db = getFirestore(this.app);
    this.auth = getAuth(this.app);
    this.roomId = roomId;
  }

  /**
   * Autenticación anónima.
   *
   * No se le pide nada al alumno —entra escribiendo su nombre y jugando— pero
   * Firebase sí necesita una identidad para que las reglas de seguridad puedan
   * exigir `request.auth != null` y evitar que cualquiera escriba desde fuera.
   */
  private async ensureAuth(): Promise<void> {
    if (this.auth.currentUser) return;
    await signInAnonymously(this.auth);
  }

  private roomRef() {
    return doc(this.db, 'rooms', this.roomId);
  }

  private playersRef() {
    return collection(this.db, 'rooms', this.roomId, 'players');
  }

  async join(name: string): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
    try {
      await this.ensureAuth();
      const id = nameKey(name);
      const ref = doc(this.playersRef(), id);

      const existing = await getDoc(ref);
      if (existing.exists()) {
        const data = existing.data();
        const expired = typeof data['expiresAt'] === 'number' && data['expiresAt'] < Date.now();
        const mine = data['uid'] === this.auth.currentUser?.uid;
        // Se permite recuperar la sesión propia (recargó la página) o ocupar
        // un hueco caducado; lo que no se permite es suplantar a otro alumno.
        if (!expired && !mine) {
          return { ok: false, reason: 'Ese nombre ya está en uso en esta sala.' };
        }
      }

      const now = Date.now();
      await setDoc(ref, {
        name,
        uid: this.auth.currentUser?.uid ?? null,
        ready: false,
        joinedAt: now,
        ...expiryFields(now),
        score: null,
        updatedAt: serverTimestamp(),
      });

      // La sala se crea sola con el primer alumno que entra.
      await setDoc(
        this.roomRef(),
        { state: 'lobby', startedAt: null, ...expiryFields(now) },
        { merge: true },
      );

      this.playerId = id;
      this.playerName = name;
      return { ok: true, id };
    } catch (error) {
      return { ok: false, reason: describeError(error) };
    }
  }

  async setReady(ready: boolean): Promise<void> {
    if (!this.playerId) return;
    try {
      await updateDoc(doc(this.playersRef(), this.playerId), {
        ready,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Una caída de red no debe interrumpir la partida del alumno.
    }
  }

  async publish(score: ScoreEntry): Promise<void> {
    if (!this.playerId) return;
    const now = Date.now();
    try {
      await updateDoc(doc(this.playersRef(), this.playerId), {
        score,
        ...expiryFields(now),
        updatedAt: serverTimestamp(),
      });

      // Campaña completada: se guarda copia permanente para el historial que
      // solo consulta el profesor. La sala se borrará en una hora; esto no.
      if (score.finishedAt !== null) {
        await setDoc(doc(this.db, 'archive', `${this.roomId}_${this.playerId}_${score.finishedAt}`), {
          room: this.roomId,
          name: this.playerName,
          levelsDone: score.levelsDone,
          seconds: score.seconds,
          defeats: score.defeats,
          finishedAt: score.finishedAt,
          archivedAt: serverTimestamp(),
        });
      }
    } catch {
      // Igual que arriba: la partida local manda, la publicación es un extra.
    }
  }

  subscribe(onChange: (snapshot: LobbySnapshot) => void): Unsubscribe {
    let state: LobbyState = 'lobby';
    let startedAt: number | null = null;
    let participants: Participant[] = [];

    const push = (): void => onChange({ state, startedAt, participants });

    const offRoom = onSnapshot(
      this.roomRef(),
      (snap) => {
        const data = snap.data();
        state = (data?.['state'] as LobbyState) ?? 'lobby';
        startedAt = (data?.['startedAt'] as number | null) ?? null;
        push();
      },
      () => push(),
    );

    const offPlayers = onSnapshot(
      this.playersRef(),
      (snap) => {
        const now = Date.now();
        participants = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: String(data['name'] ?? d.id),
              ready: Boolean(data['ready']),
              joinedAt: Number(data['joinedAt'] ?? 0),
              expiresAt: Number(data['expiresAt'] ?? Number.MAX_SAFE_INTEGER),
              score: (data['score'] as ScoreEntry | null) ?? null,
            };
          })
          // El filtro por caducidad se aplica también en el cliente: la
          // política de TTL del servidor puede tardar en pasar, y el requisito
          // es que los datos de una sesión no se vean en la siguiente.
          .filter((p) => p.expiresAt > now)
          .map(({ id, name, ready, joinedAt, score }) => ({ id, name, ready, joinedAt, score }));
        push();
      },
      () => push(),
    );

    this.unsubscribers.push(offRoom, offPlayers);
    return () => {
      offRoom();
      offPlayers();
    };
  }

  async startCompetition(): Promise<void> {
    const now = Date.now();
    await setDoc(
      this.roomRef(),
      { state: 'running', startedAt: now, ...expiryFields(now) },
      { merge: true },
    );
  }

  /**
   * Saca a un participante borrando su documento.
   *
   * No se marca como expulsado ni se guarda una lista negra: el alumno puede
   * volver a entrar con un nombre correcto, que es justo lo que se quiere. Lo
   * que se corrige es el nombre proyectado, no la persona.
   */
  async removeParticipant(id: string): Promise<void> {
    try {
      await deleteDoc(doc(this.playersRef(), id));
    } catch {
      // Sin permisos o sin red: la sala sigue funcionando.
    }
  }

  async resetCompetition(): Promise<void> {
    const now = Date.now();
    // Se borran los participantes uno a uno: Firestore no elimina
    // subcolecciones al borrar el documento padre.
    const players = await getDocs(this.playersRef());
    await Promise.all(players.docs.map((d) => deleteDoc(d.ref)));
    await setDoc(
      this.roomRef(),
      { state: 'lobby', startedAt: null, ...expiryFields(now) },
      { merge: true },
    );
  }

  dispose(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
  }
}

/** Traduce un error de Firebase a algo que un alumno pueda entender. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('permission')) return 'La sala no acepta jugadores ahora mismo.';
  if (message.includes('network') || message.includes('unavailable')) {
    return 'Sin conexión. Comprueba el wifi e inténtalo otra vez.';
  }
  return 'No se pudo entrar a la sala. Inténtalo de nuevo.';
}
