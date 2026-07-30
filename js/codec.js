// js/codec.js — pack/plan <-> URL-safe string. Pure: no DOM. See docs/03-data-model.md.
// Pipeline: JSON.stringify -> TextEncoder (UTF-8 bytes) -> base64 -> URL-safe substitution
// (+ -> -, / -> _, strip =). Decoding reverses it and never throws on bad input.

/** Largest encoded pack a URL can safely carry. Past this, author.html falls back to
 * a hosted #pf=<file>.json instead of an inline link (see docs/03-data-model.md). */
export const MAX_ENCODED_CHARS = 6000;

/** Encode any JSON-serialisable value to a URL-safe string.
 * @param {*} value @returns {string} */
function encode(value) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a URL-safe string back to a value. Never throws.
 * @param {string} str @returns {{ ok: true, value: * } | { ok: false, error: string }} */
function decode(str) {
  try {
    if (typeof str !== 'string' || str.length === 0) {
      return { ok: false, error: 'empty or non-string input' };
    }
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const binary = atob(b64); // throws on illegal base64
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return { ok: true, value: JSON.parse(json) }; // throws on malformed JSON
  } catch (err) {
    return { ok: false, error: 'could not decode input' };
  }
}

/** Encode a pack to a URL-safe fragment string.
 * @param {object} pack @returns {string} */
export function encodePack(pack) {
  return encode(pack);
}

/** Decode a pack from a URL-safe string. Never throws.
 * On success returns the pack object (so it deep-equals the original); on failure
 * returns { ok: false, error }.
 * @param {string} str @returns {object | { ok: false, error: string }} */
export function decodePack(str) {
  const r = decode(str);
  return r.ok ? r.value : { ok: false, error: r.error };
}

/** Encode a plan to a URL-safe string.
 * @param {object} plan @returns {string} */
export function encodePlan(plan) {
  return encode(plan);
}

/** Decode a plan from a URL-safe string. Never throws.
 * On success returns the plan object; on failure returns { ok: false, error }.
 * @param {string} str @returns {object | { ok: false, error: string }} */
export function decodePlan(str) {
  const r = decode(str);
  return r.ok ? r.value : { ok: false, error: r.error };
}
