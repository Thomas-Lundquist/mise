// Saves and loads the student's recipe in this browser only. Nothing leaves the device.

var STORAGE_KEY = "mise.recipe";

function emptyRecipe() {
  return {
    title: "",
    servings: "",
    startTime: "",
    minutesAvailable: 90,
    cooks: 1,
    ingredients: [],
    equipment: [],
    bowls: [],
    steps: [],
    screen: 0
  };
}

function loadRecipe() {
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return Object.assign(emptyRecipe(), saved);
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
