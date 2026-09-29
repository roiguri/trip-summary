'use client';
import { useEffect, useState } from 'react';

/** Phone layout (under 900px, the same breakpoint as the stylesheet's phone section). */
export const PHONE_QUERY = '(max-width: 899px)';

export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return phone;
}
