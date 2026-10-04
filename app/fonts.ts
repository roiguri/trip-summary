import { Fraunces } from 'next/font/google';

/** The wordmark's face (DESIGN.md, "Name and top bar"): used for the name only; the app keeps its
 *  own type. Self-hosted by next/font at build time. */
export const wordmark = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
  variable: '--font-wordmark',
});
