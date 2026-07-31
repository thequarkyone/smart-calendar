import type { CSSProperties } from 'react';

/** Shared "translucent card" look — used by calendar day cells and, generically, every
 * sidebar/zone-bar widget, so the whole display reads as one consistent visual system. */
export const CARD_STYLE: CSSProperties = {
  border: '1px solid var(--divider)',
  borderRadius: '8px',
  backgroundColor: 'var(--surface)',
};
