// Teacher-editable config. Edit these lists to change what's available in the app.
// No code elsewhere should need to change to add/remove/rename items here.

export const EQUIPMENT_PALETTE = {
  Cook: [
    "Sauté pan",
    "Saucepan",
    "Stock pot",
    "Sheet pan",
    "Cast iron skillet",
    "Roasting pan",
    "Wok",
    "Griddle",
    "Broiler pan",
    "Double boiler",
  ],
  Prep: [
    "Chef knife",
    "Paring knife",
    "Cutting board",
    "Mixing bowl (small)",
    "Mixing bowl (large)",
    "Colander",
    "Whisk",
    "Rubber spatula",
    "Tongs",
    "Box grater",
    "Peeler",
    "Sheet tray",
    "Cooling rack",
    "Kitchen shears",
  ],
  Measure: [
    "Measuring cups (dry)",
    "Measuring cups (liquid)",
    "Measuring spoons",
    "Kitchen scale",
    "Instant-read thermometer",
    "Timer",
  ],
};

export const STATIONS = ["Oven", "Stovetop", "Cold", "Prep"];

// Used to guess a station from a step name (phase 2 of the scaffolded planner).
// First keyword match wins; manual override always available.
export const STATION_KEYWORDS = {
  Oven: ["bake", "roast", "broil", "oven"],
  Stovetop: ["simmer", "boil", "sauté", "saute", "fry", "sear", "reduce", "stovetop", "burner"],
  Cold: ["chill", "freeze", "cool", "refrigerate", "rest", "set up", "fridge"],
  Prep: ["chop", "dice", "mince", "mix", "whisk", "measure", "prep", "slice", "peel"],
};

export const DEFAULT_BOWL_COUNT = 3;
export const DEFAULT_SERVICE_TIME = "12:35";
export const DEFAULT_TIMER_MINUTES = 10;
