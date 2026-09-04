// A very small element builder.
//
// The previous build spent roughly four hundred lines on createElement /
// className / appendChild boilerplate, which buried what each view was
// actually saying. Everything here is one function plus three conveniences.
//
//   h("p", { class: "note" }, "Careful.")
//   h("button", { class: "btn", onClick: save }, "Save")
//   h("li", null, h("span", { text: name }), removeButton)
//
// Props are applied as DOM properties where one exists (value, checked,
// disabled, id, type…) and as attributes otherwise (aria-*, role, for),
// so nothing needs a special case at the call site.

export function h(tag, props, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") Object.assign(node.style, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else setProp(node, key, value);
  }

  append(node, children);
  return node;
}

// Prefer the DOM property when there is one, because properties take live values
// (`checked`, `value`, `disabled`) rather than strings.
//
// Some attributes reflect as READ-ONLY properties, though: `input.list` is the
// resolved <datalist> element, not its id, and assigning to it throws in strict
// mode — which every module here is. That throw happened mid-render, so the new
// tree was never swapped in and the page silently sat there looking unchanged.
// Anything that refuses assignment is an attribute, so set it as one.
function setProp(node, key, value) {
  if (!(key in node)) {
    node.setAttribute(key, value);
    return;
  }
  try {
    node[key] = value;
  } catch {
    node.setAttribute(key, value);
  }
}

// Children may be nodes, strings, arrays, or null — so a view can write
// `cond && h(...)` inline without guarding every branch.
export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    node.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
  return node;
}

// A labelled form control. The label needs a real `for`, so the id is required.
export function field(labelText, control, { class: className = "field", hint = null } = {}) {
  return h("div", { class: className },
    h("label", { for: control.id, text: labelText }),
    control,
    hint && h("p", { class: "hint", text: hint }));
}

export function button(label, onClick, { class: className = "btn", ...rest } = {}) {
  return h("button", { type: "button", class: className, onClick, ...rest }, label);
}

// The small × that removes a row. Always carries a spoken label, because "×"
// alone tells a screen reader nothing about what is being removed.
export function removeButton(what, onClick, className = "icon-btn") {
  return h("button", {
    type: "button",
    class: `${className} no-print`,
    onClick,
    "aria-label": `Remove ${what}`,
    title: `Remove ${what}`,
  }, "×");
}
