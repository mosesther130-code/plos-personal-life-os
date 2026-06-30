// PLOS Firebase JS SDK initialiser (web + native).
// Used ONLY for Firestore real-time listeners (family_locations collection).
// Push notifications are handled server-side via the Emergent relay — NOT here.
//
// TODO: Switch Firestore to production mode and apply proper security rules
//       before publishing to App Store. Currently the project is in TEST MODE
//       so the web SDK can read/write without auth federation.
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
  collection,
  query,
  where,
  onSnapshot,
  Unsubscribe,
  Timestamp,
} from "firebase/firestore";

// Firebase API keys are project identifiers, NOT secrets.
// The values below come from the iOS GoogleService-Info.plist of project plos-53fbd.
// Using the iOS appId + apiKey works fine for the Firestore JS SDK in dev/preview.
const firebaseConfig = {
  apiKey: "AIzaSyCesSubKE3BEu3Vzh4PPULbJY7nZTpcQ5c",
  authDomain: "plos-53fbd.firebaseapp.com",
  projectId: "plos-53fbd",
  storageBucket: "plos-53fbd.firebasestorage.app",
  messagingSenderId: "830884975737",
  appId: "1:830884975737:ios:175e024d183a3d72c7f0a8",
};

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return _app;
}

export function getDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getFirebaseApp());
  return _db;
}

export type FamilyLocationDoc = {
  user_id: string;            // matches PLOS member_id
  owner_user_id: string;
  display_name: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: Timestamp | null;
  sharing_active: boolean;
  sharing_expires_at: Timestamp | string | null;
  message: string | null;
  trip_active: boolean;
};

/**
 * Subscribe to live updates for every family member owned by `ownerUserId`.
 * Returns an unsubscribe function — call it on screen unmount.
 *
 * `onData` is called with the full snapshot array on every change.
 * `onError` is optional; defaults to console.warn so the UI never crashes.
 */
export function subscribeFamilyLocations(
  ownerUserId: string,
  onData: (docs: FamilyLocationDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getDb();
  const q = query(
    collection(db, "family_locations"),
    where("owner_user_id", "==", ownerUserId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const docs: FamilyLocationDoc[] = [];
      snap.forEach((d) => {
        const raw = d.data() as any;
        docs.push({
          user_id: raw.user_id || d.id,
          owner_user_id: raw.owner_user_id,
          display_name: raw.display_name || "Unknown",
          latitude: Number(raw.latitude),
          longitude: Number(raw.longitude),
          accuracy: raw.accuracy ?? null,
          timestamp: raw.timestamp ?? null,
          sharing_active: !!raw.sharing_active,
          sharing_expires_at: raw.sharing_expires_at ?? null,
          message: raw.message ?? null,
          trip_active: !!raw.trip_active,
        });
      });
      onData(docs);
    },
    (err) => {
      (onError || console.warn)(err as Error);
    }
  );
}
