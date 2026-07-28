// Teacher-editable config. Edit these lists to change what's available in the
// app. No code elsewhere should need to change to add/remove/rename items here.

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

// Where an unattended step goes when the student answers "Nothing — it just
// sits". Resting on the counter is the prep bench.
export const NO_EQUIPMENT_STATION = "Prep";

// `group` is how the item is grouped for browsing in the Pull palette.
// `station` is which lane it puts a step on, and what it contends for.
export const EQUIPMENT_PALETTE = [
  // Cook
  { name: "Sauté pan", group: "Cook", station: "Stovetop" },
  { name: "Saucepan", group: "Cook", station: "Stovetop" },
  { name: "Stock pot", group: "Cook", station: "Stovetop" },
  { name: "Cast iron skillet", group: "Cook", station: "Stovetop" },
  { name: "Wok", group: "Cook", station: "Stovetop" },
  { name: "Griddle", group: "Cook", station: "Stovetop" },
  { name: "Double boiler", group: "Cook", station: "Stovetop" },
  { name: "Sheet pan", group: "Cook", station: "Oven" },
  { name: "Roasting pan", group: "Cook", station: "Oven" },
  { name: "Broiler pan", group: "Cook", station: "Oven" },

  // Prep
  { name: "Chef knife", group: "Prep", station: "Prep" },
  { name: "Paring knife", group: "Prep", station: "Prep" },
  { name: "Cutting board", group: "Prep", station: "Prep" },
  { name: "Mixing bowl (small)", group: "Prep", station: "Prep" },
  { name: "Mixing bowl (large)", group: "Prep", station: "Prep" },
  { name: "Colander", group: "Prep", station: "Prep" },
  { name: "Whisk", group: "Prep", station: "Prep" },
  { name: "Rubber spatula", group: "Prep", station: "Prep" },
  { name: "Tongs", group: "Prep", station: "Prep" },
  { name: "Box grater", group: "Prep", station: "Prep" },
  { name: "Peeler", group: "Prep", station: "Prep" },
  { name: "Sheet tray", group: "Prep", station: "Prep" },
  { name: "Cooling rack", group: "Prep", station: "Prep" },
  { name: "Kitchen shears", group: "Prep", station: "Prep" },

  // Cold
  { name: "Refrigerator", group: "Cold", station: "Cold" },
  { name: "Freezer", group: "Cold", station: "Cold" },
  { name: "Ice bath", group: "Cold", station: "Cold" },

  // Measure
  { name: "Measuring cups (dry)", group: "Measure", station: "Prep" },
  { name: "Measuring cups (liquid)", group: "Measure", station: "Prep" },
  { name: "Measuring spoons", group: "Measure", station: "Prep" },
  { name: "Kitchen scale", group: "Measure", station: "Prep" },
  { name: "Instant-read thermometer", group: "Measure", station: "Prep" },
];

// Order the Pull palette shows its groups in.
export const EQUIPMENT_GROUPS = ["Cook", "Prep", "Cold", "Measure"];

// Custom equipment a student types themselves has no station of its own.
export const CUSTOM_EQUIPMENT_STATION = "Prep";

export const DEFAULT_BOWL_COUNT = 3;

// A period is 10 minutes of intro, 70 minutes of cooking, 10 minutes of clean.
// The cooking window is the only number the plan is actually measured against,
// and it's the same in every period, all year.
//
// The plan itself is stored as durations, not clock times, so it stays correct
// on a special day, in a different period, or next year. A period only supplies
// the anchor that turns those durations into wall-clock times on the board and
// the printout — useful at the stove, where there's a clock on the wall.
export const COOKING_WINDOW_MINUTES = 70;

// ⚠️ PLACEHOLDER TIMES — replace with the real bell schedule before students
// use this. `foodUp` is when food has to be plated: the period's end minus the
// ten-minute clean. Cooking starts 70 minutes before that.
//
// Set once for the year. Students pick their period (it defaults to whichever
// matches the current time of day); a teacher can also pin one on the embed URL
// with ?foodUp=10:15, which is also how a special day gets handled.
export const PERIODS = [
  { id: "p1", label: "Period 1", foodUp: "09:20" },
  { id: "p2", label: "Period 2", foodUp: "11:00" },
  { id: "p3", label: "Period 3", foodUp: "12:55" },
  { id: "p4", label: "Period 4", foodUp: "14:35" },
];

// Planning countdown, in minutes. 0 = off, which is the default: a clock
// ticking down in the corner is pressure, and it should only appear when a
// teacher has actually asked for it. Turn it on per assignment with ?timer=10
// on the Canvas embed URL, or raise this to make it the default for every link.
export const DEFAULT_TIMER_MINUTES = 0;
