// Engine-order spectrum at a fixed speed: `node scripts/orders.ts <id> [rpm] [pedal] [--free | --dyno]`.
// Prints the level of every half order relative to the strongest one, and its absolute level to compare modes.
//   --free: the free-revving engine held at that speed by the pedal, as when blipping in neutral.
//   --dyno: the engine on the dyno at that speed, the pedal as given (full load by default).

import { engineOrders, type OrderMode } from './analysis.ts';

const args = process.argv.slice(2);
const mode: OrderMode = args.includes('--free') ? 'free' : args.includes('--dyno') ? 'dyno' : 'locked';
const [id = 'v8-cross', rpmArg, pedalArg] = args.filter((a) => !a.startsWith('--'));
const rows = engineOrders(id, rpmArg ? Number(rpmArg) : undefined, pedalArg ? Number(pedalArg) : mode === 'dyno' ? 1 : 0.8, 'l', 16, mode);
console.log(`order  rel  abs   (${mode})`);
console.log(rows.map((r) => `${r.order.toFixed(1).padStart(5)} ${r.db.toFixed(0).padStart(4)} ${r.level.toFixed(1).padStart(6)} ${'#'.repeat(Math.max(0, Math.round((r.db + 50) / 2)))}`).join('\n'));
