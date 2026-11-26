// A car on a track, for the oil sump page now and the whole-car section later. No DOM: tests and scripts run it.
//
// Interface the oil sump relies on, so the whole-car section can grow the model behind it:
// - buildTrack(def) and TEST_CIRCUIT: new circuits are new TrackDefs.
// - simulateLap(track, car, tyre, powertrain, { grip }): weight transfer and load-sensitive tyres come in as a GripModel
//   (src/suspension/lap.ts builds one from a chassis); without it the point lap is unchanged.
// - Powertrain: idealGearbox is a stand-in; a real gearbox implements the same interface.
// - The sump reads only LapTrace.t, lapTime, axF, ayF, avF, rpm and throttle, and carToEngine for the mount.

export * from './track.ts';
export * from './vehicle.ts';
export * from './powertrain.ts';
export * from './lap.ts';
export * from './mount.ts';
