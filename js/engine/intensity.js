// Intensity sentence shown on the set screen, generated from the tier and the RIR target.

function rirText(rir) {
  const [a, b] = rir;
  if (a === b) return `${a} rep${a > 1 ? 's' : ''} en réserve`;
  return `${a} à ${b} reps en réserve`;
}

export function intensityPhrase(item, set) {
  if (set.kind === 'power') return 'Explosif : chaque rep à vitesse maximale. Arrête la série dès que ça ralentit.';
  if (set.kind === 'top') return 'Prends une charge qui te permet 3 à 5 reps en gardant 2 reps en réserve. Technique parfaite.';
  if (set.kind === 'finisher' || !set.rir) return item.note || null;
  const [a, b] = set.rir;
  if (a === 0) return 'Proche de l’échec : la dernière rep doit être très dure, au plus 1 rep en réserve.';
  return `Difficile mais propre : arrête-toi quand il te reste ${rirText([a, b])}. Les dernières reps ralentissent, la technique ne bouge pas.`;
}
