// Laying blocks out on a time axis, in whatever unit the caller draws in.
//
// The board draws in pixels on a screen and the printed sheet draws in
// millimetres on paper. The arithmetic is identical and subtle enough that two
// copies of it would eventually disagree, so it lives here once and takes the
// scale as an argument.
//
// Nothing here touches the DOM or knows what a step is.

// Greedy interval packing: each block goes in the first sub-column whose
// previous block has finished. This is what stops two steps at the same minute
// painting over each other — which once lost a step entirely from a printout.
//
// Packed on DRAWN SIZE, not on minutes. Once a very short block is floored to a
// legible height it occupies more of the lane than its duration claims, and two
// half-minute steps a minute apart would otherwise be given the same sub-column
// and drawn on top of each other.
//
// Mutates each item with `offset`, `size` and `row`, and returns them in
// drawing order.
export function packRows(items, top, scale, { minSize = 0, gap = 0 } = {}) {
  const sorted = [...items].sort((a, b) =>
    a.range.start - b.range.start || a.range.end - b.range.end);

  const rowEnds = [];
  for (const item of sorted) {
    item.offset = (item.range.start - top) * scale;
    item.size = Math.max(
      minSize,
      Math.max(item.range.end - item.range.start, 0) * scale - gap,
    );
    const end = item.offset + item.size;

    let row = rowEnds.findIndex((rowEnd) => rowEnd <= item.offset);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(-Infinity);
    }
    rowEnds[row] = end;
    item.row = row;
  }

  return { items: sorted, rowCount: Math.max(1, rowEnds.length) };
}

// Evenly divided sub-columns within a lane, as percentages, so a caller can
// position a packed block without repeating the division. `gap` is a CSS length
// in the caller's own unit — paper is measured in millimetres and a screen is
// not, and neither should have the other's units leak into it.
export function columnStyle(item, rowCount, gap = "2px") {
  return {
    left: `${(item.row / rowCount) * 100}%`,
    width: `calc(${(1 / rowCount) * 100}% - ${gap})`,
  };
}
