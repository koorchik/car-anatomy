// Engine-order spectrum at a fixed speed: `node scripts/orders.ts <id> [rpm] [pedal]`.
// Prints the level of every half order relative to the strongest one.

import { engineOrders } from './analysis.ts';

const [id = 'v8-cross', rpmArg, pedalArg] = process.argv.slice(2);
const rows = engineOrders(id, rpmArg ? Number(rpmArg) : undefined, pedalArg ? Number(pedalArg) : 0.8);
console.log(rows.map((r) => `${r.order.toFixed(1).padStart(5)} ${r.db.toFixed(0).padStart(4)} ${'#'.repeat(Math.max(0, Math.round((r.db + 50) / 2)))}`).join('\n'));
