// Teacher-editable settings. Changing anything here should never require a
// change anywhere else in the app.

// Stations do two jobs. Every station is a lane on the board — seeing where
// your work is happening is the point. Only a station marked `exclusive` also
// warns when two steps want it at the same time.
//
// Only the oven is exclusive, deliberately. There are several burners, a fridge
// holds plenty, and two prep tasks at once is already caught by the "You" lane
// (you only have one pair of hands), so flagging those would either be wrong or
// would double-warn. A model that over-warns teaches students to click past
// warnings, which is the worst outcome for a design that only ever warns and
// never blocks. Better one warning they believe than four they learn to ignore.
//
// Order matters: a step using equipment from more than one station draws on the
// first station listed here that it touches. "Anything in the oven is an oven
// step" is the useful reading.
export const STATIONS = [
  { id: "Oven", label: "Oven", exclusive: true },
  { id: "Stovetop", label: "Stovetop", exclusive: false },
  { id: "Cold", label: "Cold", exclusive: false },
  { id: "Prep", label: "Prep", exclusive: false },
];

// Where an unattended step goes when the student answers "nothing — it just
// sits". Resting on the counter is the prep bench.
export const NO_EQUIPMENT_STATION = "Prep";

// Equipment a student names themselves has no station of its own.
export const CUSTOM_EQUIPMENT_STATION = "Prep";

// A recipe never lists its equipment — students find it by reading the method.
// This list exists to autocomplete what they type and, more importantly, to
// attach a station to it, which is what puts the step on a lane.
export const EQUIPMENT_PALETTE = [
  { name: "Sauté pan", station: "Stovetop" },
  { name: "Saucepan", station: "Stovetop" },
  { name: "Stock pot", station: "Stovetop" },
  { name: "Cast iron skillet", station: "Stovetop" },
  { name: "Wok", station: "Stovetop" },
  { name: "Griddle", station: "Stovetop" },
  { name: "Double boiler", station: "Stovetop" },

  { name: "Sheet pan", station: "Oven" },
  { name: "Roasting pan", station: "Oven" },
  { name: "Broiler pan", station: "Oven" },
  { name: "Casserole dish", station: "Oven" },

  { name: "Refrigerator", station: "Cold" },
  { name: "Freezer", station: "Cold" },
  { name: "Ice bath", station: "Cold" },

  { name: "Chef knife", station: "Prep" },
  { name: "Paring knife", station: "Prep" },
  { name: "Cutting board", station: "Prep" },
  { name: "Mixing bowl (small)", station: "Prep" },
  { name: "Mixing bowl (large)", station: "Prep" },
  { name: "Colander", station: "Prep" },
  { name: "Whisk", station: "Prep" },
  { name: "Rubber spatula", station: "Prep" },
  { name: "Tongs", station: "Prep" },
  { name: "Box grater", station: "Prep" },
  { name: "Peeler", station: "Prep" },
  { name: "Cooling rack", station: "Prep" },
  { name: "Kitchen shears", station: "Prep" },
  { name: "Measuring cups (dry)", station: "Prep" },
  { name: "Measuring cups (liquid)", station: "Prep" },
  { name: "Measuring spoons", station: "Prep" },
  { name: "Kitchen scale", station: "Prep" },
  { name: "Instant-read thermometer", station: "Prep" },
];

// How long a step's hands-on lead is when the student says it "starts, then
// runs by itself". Almost every instruction has this shape — you put the pan
// on, it heats without you — and one minute is the honest small number for
// getting something going.
//
// It comes OUT of the time the recipe states, rather than being added on top,
// so a step still adds up to what the card says. The student can stretch it
// afterwards like any other line.
export const HANDS_ON_LEAD_MINUTES = 1;

// What the method implies about equipment. A recipe never lists it, so section
// 3 exists to make the student read for it — but sending them at an empty
// dropdown teaches less than showing them the mapping and letting them disagree
// with it. These are SUGGESTIONS: nothing is attached to a step until it is
// tapped.
//
// `words` are matched whole, case-insensitively, against the step's name and
// its line labels. Order matters only in that every match is offered.
export const EQUIPMENT_HINTS = [
  { words: ["roast", "roasted", "bake", "baked", "sheet pan"], equipment: "Sheet pan" },
  { words: ["broil", "broiled"], equipment: "Broiler pan" },
  { words: ["casserole", "gratin", "lasagna"], equipment: "Casserole dish" },

  { words: ["saute", "sauté", "sear", "brown", "fry", "pan-fry"], equipment: "Sauté pan" },
  { words: ["boil", "blanch", "parboil"], equipment: "Stock pot" },
  { words: ["simmer", "reduce", "poach", "steam"], equipment: "Saucepan" },
  { words: ["stir-fry", "stir fry"], equipment: "Wok" },
  { words: ["griddle", "pancakes"], equipment: "Griddle" },
  { words: ["melt", "temper"], equipment: "Double boiler" },

  { words: ["chill", "refrigerate", "fridge", "marinate", "rest in the fridge"], equipment: "Refrigerator" },
  { words: ["freeze"], equipment: "Freezer" },
  { words: ["shock", "ice bath"], equipment: "Ice bath" },

  { words: ["chop", "dice", "mince", "slice", "julienne", "cut"], equipment: "Chef knife" },
  { words: ["chop", "dice", "mince", "slice", "julienne", "cut"], equipment: "Cutting board" },
  { words: ["peel"], equipment: "Peeler" },
  { words: ["grate", "shred"], equipment: "Box grater" },
  { words: ["whisk", "whip"], equipment: "Whisk" },
  { words: ["drain", "rinse"], equipment: "Colander" },
  { words: ["measure", "weigh"], equipment: "Kitchen scale" },
  { words: ["mix", "combine", "toss", "dredge", "fold"], equipment: "Mixing bowl (large)" },
  { words: ["temperature", "temp", "probe", "internal"], equipment: "Instant-read thermometer" },
  { words: ["cool", "rest"], equipment: "Cooling rack" },
];

// How far under a recipe's own claimed times the student's step times have to
// fall before the board says they probably missed something on the card. Some
// gap is normal — a recipe's header is a round number — so this is deliberately
// loose. Only a real shortfall is worth a word.
export const CLAIM_SHORTFALL_RATIO = 0.6;

// How many people can share one plan. The sheet a student keeps is always the
// solo one; group is a toggle over the same steps, for whoever is managing the
// kitchen that day.
export const MAX_COOKS = 5;

// A period is 10 minutes of intro, 70 minutes of cooking, 10 minutes of clean.
// The cooking window is the only number a plan is measured against, and it is
// the same in every period, all year.
export const COOKING_WINDOW_MINUTES = 70;

// ⚠️ PLACEHOLDER TIMES — replace with the real bell schedule before students
// use this. `foodUp` is when food has to be plated: the period's end minus the
// ten-minute clean.
//
// Set once for the year. Students pick their period (it defaults to whichever
// matches the current time of day); a teacher can pin one on the embed URL with
// ?foodUp=10:15, which is also how a special day gets handled.
export const PERIODS = [
  { id: "p1", label: "Period 1", foodUp: "09:20" },
  { id: "p2", label: "Period 2", foodUp: "11:00" },
  { id: "p3", label: "Period 3", foodUp: "12:55" },
  { id: "p4", label: "Period 4", foodUp: "14:35" },
];

// Planning countdown, in minutes. 0 = off, which is the default: a clock
// ticking down in the corner is pressure, and it should only appear when a
// teacher has asked for it. Turn it on per assignment with ?timer=10.
export const DEFAULT_TIMER_MINUTES = 0;
