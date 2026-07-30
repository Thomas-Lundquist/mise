// tests/assert.js — minimal assertion harness for Mise Planner. No dependencies, no framework.
// Named exports only: test, eq, throws, report.
const results = [];

/** Register and run one test; a thrown error marks it failed.
 * @param {string} name @param {() => void} fn @returns {void} */
export function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true, msg: '' });
  } catch (err) {
    results.push({ name, ok: false, msg: err && err.message ? err.message : String(err) });
  }
}

/** Assert deep structural equality; throws on mismatch.
 * @param {*} actual @param {*} expected @param {string} [msg] @returns {void} */
export function eq(actual, expected, msg) {
  if (!deepEqual(actual, expected)) {
    const detail = 'expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual);
    throw new Error((msg ? msg + ': ' : '') + detail);
  }
}

/** Assert that calling fn throws; fails if it returns normally.
 * @param {() => void} fn @param {string} [msg] @returns {void} */
export function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  if (!threw) throw new Error((msg ? msg + ': ' : '') + 'expected function to throw');
}

/** Write pass/fail counts and any failures into the page.
 * @returns {void} */
export function report() {
  const failed = results.filter((r) => !r.ok);
  const root = document.body || document.documentElement;
  const head = document.createElement('h1');
  head.textContent = results.length + ' tests, ' + failed.length + ' failures';
  root.appendChild(head);
  for (const r of failed) {
    const line = document.createElement('div');
    line.style.color = 'var(--alert, #A8321E)';
    line.textContent = 'FAIL — ' + r.name + ': ' + r.msg;
    root.appendChild(line);
  }
}

/** Recursive structural equality for JSON-shaped values.
 * @param {*} a @param {*} b @returns {boolean} */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}
