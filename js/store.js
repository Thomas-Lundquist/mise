// Saves and loads the student's recipe in this browser only. Nothing leaves the device.

var STORAGE_KEY = "mise.recipe";
var RECIPE_VERSION = 2;

function emptyRecipe() {
  return {
    version: RECIPE_VERSION,
    title: "",
    servings: "",
    startTime: "",
    minutesAvailable: 90,
    cooks: 1,
    ingredients: [],
    bowls: [],
    steps: [],
    extraTools: [],
    screen: 0
  };
}

// Work saved by an older version of mise is brought up to date.
function upgradeRecipe(saved) {
  if (!saved.version) {
    // Version 1 had its own Equipment screen (with quantities) and a List | Blocks switch.
    saved.extraTools = (saved.equipment || [])
      .filter(function (e) { return e.name && e.name.trim(); })
      .map(function (e) { return (e.qty > 1 ? e.qty + " × " : "") + e.name.trim(); });
    // Its screens were Recipe, Ingredients, Equipment, Bowls, Steps, Guide.
    saved.screen = [0, 1, 2, 2, 3, 4][saved.screen] || 0;
    delete saved.equipment;
    delete saved.planView;
    saved.version = RECIPE_VERSION;
  }
  (saved.steps || []).forEach(function (s) {
    s.tools = s.tools || [];
    s.bowlIds = s.bowlIds || [];
  });
  return saved;
}

function loadRecipe() {
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return Object.assign(emptyRecipe(), upgradeRecipe(saved));
  } catch (e) {
    // Storage blocked or unreadable: start fresh.
  }
  return emptyRecipe();
}

function saveRecipe(recipe) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe));
  } catch (e) {
    // Storage blocked (e.g. private window): the app still works, it just won't remember.
  }
}

function newId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 8);
}
