/**
 * Helpers responsible for maintaining ordered selections for the equipment
 * panels. The logic was extracted from the Next.js page to make the component
 * easier to follow.
 */

export function normalizeSelection(indexes, limit, poolLength) {
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(poolLength) || poolLength <= 0) {
    return { indexes: [], changed: Array.isArray(indexes) && indexes.length > 0 };
  }

  const previous = Array.isArray(indexes) ? indexes : [];
  const used = new Set();
  const normalized = Array.from({ length: limit }, (_, slotIndex) => {
    let candidate = previous[slotIndex];
    if (!Number.isFinite(candidate) || candidate < 0 || candidate >= poolLength) {
      candidate = slotIndex;
    }

    let safety = 0;
    while (used.has(candidate) && safety < poolLength) {
      candidate = (candidate + 1) % poolLength;
      safety += 1;
    }

    used.add(candidate);
    return candidate;
  });

  const changed =
    normalized.length !== previous.length ||
    normalized.some((value, index) => value !== previous[index]);

  return { indexes: normalized, changed };
}

export function cycleItemSelection(indexes, limit, poolLength, targetSlot, options = {}) {
  const normalizedResult = normalizeSelection(indexes, limit, poolLength);
  const normalized = normalizedResult.indexes;
  let changed = normalizedResult.changed;

  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(poolLength) || poolLength <= 0) {
    return { indexes: normalized, selection: null, changed };
  }

  if (!Number.isFinite(targetSlot) || targetSlot < 0 || targetSlot >= limit) {
    return { indexes: normalized, selection: null, changed };
  }

  if (Number.isFinite(options.forcedSelection)) {
    const desired = Math.min(poolLength - 1, Math.max(0, Math.trunc(options.forcedSelection)));
    const used = new Set([desired]);
    const updated = Array.from({ length: limit }, (_, slotIndex) => {
      if (slotIndex === targetSlot) {
        return desired;
      }

      let candidate = normalized[slotIndex];
      if (!Number.isFinite(candidate) || candidate < 0 || candidate >= poolLength) {
        candidate = slotIndex >= targetSlot ? slotIndex + 1 : slotIndex;
      }

      let safety = 0;
      while (used.has(candidate) && safety < poolLength) {
        candidate = (candidate + 1) % poolLength;
        safety += 1;
      }

      used.add(candidate);
      return candidate;
    });

    const updatedChanged =
      changed ||
      updated.length !== normalized.length ||
      updated.some((value, index) => value !== normalized[index]);

    return { indexes: updated, selection: desired, changed: updatedChanged };
  }

  const activeIndex = normalized[targetSlot];
  if (!Number.isFinite(activeIndex)) {
    return { indexes: normalized, selection: null, changed };
  }

  if (poolLength <= 1) {
    return { indexes: normalized, selection: activeIndex, changed };
  }

  const forbidden = new Set(normalized.filter((_, index) => index !== targetSlot));
  let nextIndex = activeIndex;
  let safety = 0;

  do {
    nextIndex = (nextIndex + 1) % poolLength;
    safety += 1;
  } while (forbidden.has(nextIndex) && safety < poolLength * 2);

  if (nextIndex === activeIndex || forbidden.has(nextIndex)) {
    return { indexes: normalized, selection: activeIndex, changed };
  }

  const updated = [...normalized];
  updated[targetSlot] = nextIndex;

  return { indexes: updated, selection: nextIndex, changed: true };
}
