// Theme palette and WCAG contrast helpers. Values mirror css/theme.css.

export const PALETTE = {
  bg: '#2B2B30',
  card: '#333339',
  cardBorder: '#5A5A63',
  text: '#F4F3EF',
  textSecondary: '#C9C8C2',
  label: '#B8B7B0',
  fieldBorder: '#C9C8C2',
  white: '#FFFFFF',
  orange: '#AD5700',
  orangeBorder: '#EF9F27',
  green: '#2E7D32',
  greenBorder: '#97C459',
  greenSaved: '#3B8C1F',
  red: '#C62828',
  redBorder: '#F09595',
  selectedText: '#9A4A00',
  target: '#FACC15',
  tier: { P: '#B4B2A9', T1: '#7F77DD', T2: '#378ADD', T3: '#5F7A99', F: '#888780' },
};

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pairs that must meet WCAG AA: [foreground, background, minimum ratio, description]. */
export const REQUIRED_PAIRS = [
  [PALETTE.white, PALETTE.orange, 4.5, 'white on orange button'],
  [PALETTE.white, PALETTE.green, 4.5, 'white on green button'],
  [PALETTE.white, PALETTE.red, 4.5, 'white on red button'],
  [PALETTE.orangeBorder, PALETTE.bg, 3, 'orange border on background'],
  [PALETTE.greenBorder, PALETTE.bg, 3, 'green border on background'],
  [PALETTE.redBorder, PALETTE.bg, 3, 'red border on background'],
  [PALETTE.orangeBorder, PALETTE.card, 3, 'orange border on card'],
  [PALETTE.greenBorder, PALETTE.card, 3, 'green border on card'],
  [PALETTE.redBorder, PALETTE.card, 3, 'red border on card'],
  [PALETTE.text, PALETTE.bg, 4.5, 'main text on background'],
  [PALETTE.text, PALETTE.card, 4.5, 'main text on card'],
  [PALETTE.textSecondary, PALETTE.card, 4.5, 'secondary text on card'],
  [PALETTE.label, PALETTE.card, 4.5, 'block titles on card'],
  [PALETTE.selectedText, PALETTE.white, 4.5, 'selected button text'],
  [PALETTE.white, PALETTE.greenSaved, 3, '"Enregistré" label (bold, >= 19 px: large text)'],
  [PALETTE.target, PALETTE.card, 3, 'target bar on card'],
];
