import { useEffect, useState } from 'react';

// Estado de React persistido en localStorage.
export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Sin espacio o almacenamiento bloqueado: se mantiene en memoria.
    }
  }, [key, value]);

  return [value, setValue];
}
