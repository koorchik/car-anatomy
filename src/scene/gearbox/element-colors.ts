// One colour per shift element of an automatic, shared by its plate pack in 3D, its button and its marks on the
// lever diagram, so the three read as one thing. Colours, not text.

const COLORS: Record<string, string> = { A: '#e2675f', B: '#e3a43b', C: '#5bb56c', D: '#4d9be0', E: '#ad80e6' };
const FALLBACK = ['#e2675f', '#e3a43b', '#5bb56c', '#4d9be0', '#ad80e6', '#47c2c2'];

export const elementColor = (id: string, index = 0): string => COLORS[id] ?? FALLBACK[index % FALLBACK.length]!;
