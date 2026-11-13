// A car on a track, for the oil sump page now and the whole-car section later. No DOM: tests and scripts run it.
//
// Interface the oil sump relies on, so the whole-car section can grow the model behind it:
// - buildTrack(def) and TEST_CIRCUIT: new circuits are new TrackDefs.
// - simulateLap(track, car, tyre, powertrain): weight transfer and load-sensitive tyres belong inside it.
// - Powertrain: idealGearbox is a stand-in; a real gearbox implements the same interface.
// - The sump reads only LapTrace.t, lapTime, axF, ayF, avF, rpm and throttle, and carToEngine for the mount.

export * from './track.ts';
export * from './vehicle.ts';
export * from './powertrain.ts';
export * from './lap.ts';
export * from './mount.ts';
