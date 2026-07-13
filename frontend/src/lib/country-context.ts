// PLOS — Country Context helper for locale-aware modules (Legal, Shopping, etc.)
// Uses a shared in-memory subscribable store so ALL consumers stay in sync
// after a country switch — plus AsyncStorage for persistence and profile
// address inference on first launch.
import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CountryOption {
  code: string;   // ISO 3166-1 alpha-2 (US, PH, BE, GB, CA, ...)
  name: string;   // Human name
  flag: string;   // Emoji
  jurisdiction: string; // Legal system reference
  currency: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: "US", name: "United States",          flag: "🇺🇸", jurisdiction: "US federal law + Georgia state law", currency: "USD" },
  { code: "PH", name: "Philippines",             flag: "🇵🇭", jurisdiction: "Philippine civil law (Republic Acts)", currency: "PHP" },
  { code: "BE", name: "Belgium",                 flag: "🇧🇪", jurisdiction: "Belgian civil law + EU regulations", currency: "EUR" },
  { code: "GB", name: "United Kingdom",          flag: "🇬🇧", jurisdiction: "English common law",                   currency: "GBP" },
  { code: "CA", name: "Canada",                   flag: "🇨🇦", jurisdiction: "Canadian federal + provincial law",   currency: "CAD" },
  { code: "AU", name: "Australia",                flag: "🇦🇺", jurisdiction: "Australian federal + state law",       currency: "AUD" },
  { code: "DE", name: "Germany",                  flag: "🇩🇪", jurisdiction: "German civil law + EU regulations",   currency: "EUR" },
  { code: "FR", name: "France",                   flag: "🇫🇷", jurisdiction: "French civil code + EU regulations",  currency: "EUR" },
];

const STORAGE_KEY = "plos.country_override";

function inferFromAddress(address?: string): string {
  if (!address) return "US";
  const a = address.toLowerCase();
  if (a.includes("philippines") || a.includes(" ph ") || a.includes("manila") || a.includes("bulacan")) return "PH";
  if (a.includes("belgium") || a.includes("brussels")) return "BE";
  if (a.includes("united kingdom") || a.includes(" uk ") || a.includes("london")) return "GB";
  if (a.includes("canada") || (a.includes(" ca ") && a.includes("ontario"))) return "CA";
  if (a.includes("australia") || a.includes("sydney") || a.includes("melbourne")) return "AU";
  if (a.includes("germany") || a.includes("deutschland") || a.includes("berlin")) return "DE";
  if (a.includes("france") || a.includes("paris")) return "FR";
  return "US";
}

export function findCountry(code: string): CountryOption {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
}

// -----------------------------------------------------------------------------
// Shared subscribable store — every `useCountry()` consumer sees the same value.
// -----------------------------------------------------------------------------
type Listener = (code: string) => void;

let _current: string = "US";
let _initialized = false;
const _listeners = new Set<Listener>();

async function _hydrateOnce() {
  if (_initialized) return;
  _initialized = true;
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) {
      _current = saved;
      _listeners.forEach((l) => l(saved));
    }
  } catch (_e) {}
}

function _setCountry(code: string) {
  _current = code;
  _listeners.forEach((l) => l(code));
  AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
}

function _subscribe(l: Listener): () => void {
  _listeners.add(l);
  return () => { _listeners.delete(l); };
}

export function useCountry(homeAddress?: string) {
  // Seed from address only if store has not been hydrated yet
  const seed = _initialized ? _current : inferFromAddress(homeAddress);
  const [countryCode, setCountryCode] = useState<string>(seed);
  const [loading, setLoading] = useState(!_initialized);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await _hydrateOnce();
      if (mounted) {
        setCountryCode(_current);
        setLoading(false);
      }
    })();
    const unsub = _subscribe((code) => { if (mounted) setCountryCode(code); });
    return () => { mounted = false; unsub(); };
  }, []);

  const changeCountry = useCallback(async (code: string) => {
    _setCountry(code);
  }, []);

  return { country: findCountry(countryCode), countryCode, changeCountry, loading };
}
