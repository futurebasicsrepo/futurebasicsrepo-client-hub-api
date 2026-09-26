'use client';

import { useEffect, useState } from 'react';

/** True on phone-sized viewports; false during server render and on larger screens. */
export function useIsPhone(query = '(max-width: 760px)') {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatch(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return match;
}
