"use client";

import { useEffect, useState } from "react";

// Returns a debounced copy of a value that only updates after `delay` ms of no
// changes. Used to keep search from firing on every keystroke.
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
