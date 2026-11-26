// The cars the overview shows (the whole-car plan, the cars of the overview): a car comes here only once every one of
// its systems has a real model and a sourced record. Ids are those of src/data/cars/. A pure module: the routes' tests
// read it without three.js.

export const OVERVIEW_CARS: readonly string[] = ['civic-type-r-fk8'];

/** What `#/car` and an address with a car the overview does not show open. */
export const DEFAULT_CAR = OVERVIEW_CARS[0]!;

/** The car an overview address asks for: its first word, if the overview shows that car. */
export const overviewCarId = (path: readonly string[]): string => (path[0] && OVERVIEW_CARS.includes(path[0]) ? path[0] : DEFAULT_CAR);
