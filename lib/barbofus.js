import { MAX_ITEM_PALETTE_COLORS, hexToNumeric } from "./utils/color";

export const BARBOFUS_BASE_URL = "https://barbofus.com/skinator";
export const BARBOFUS_EQUIPMENT_SLOTS = ["6", "7", "8", "9", "10", "11", "12"];
export const BARBOFUS_SLOT_BY_TYPE = {
  coiffe: "6",
  cape: "7",
  familier: "8",
  bouclier: "9",
  ailes: "10",
  epauliere: "11",
  costume: "12",
};

export const LOOK_PREVIEW_SIZE = 512;

export const BARBOFUS_FACE_ID_BY_CLASS = Object.freeze({
  1: { male: 1, female: 9 },
  2: { male: 17, female: 25 },
  3: { male: 33, female: 41 },
  4: { male: 49, female: 57 },
  5: { male: 65, female: 73 },
  6: { male: 81, female: 89 },
  7: { male: 97, female: 105 },
  8: { male: 113, female: 121 },
  9: { male: 129, female: 137 },
  10: { male: 145, female: 153 },
  11: { male: 161, female: 169 },
  12: { male: 177, female: 185 },
  13: { male: 193, female: 201 },
  14: { male: 209, female: 217 },
  15: { male: 225, female: 233 },
  16: { male: 241, female: 249 },
  17: { male: 257, female: 265 },
  18: { male: 273, female: 275 },
  19: { male: 294, female: 302 },
});

const BARBOFUS_DEFAULT_FACE_ENTRY = BARBOFUS_FACE_ID_BY_CLASS[7] ?? {};

export const BARBOFUS_DEFAULTS = {
  gender: 1,
  classId: 7,
  lookId: 405,
  faceId: Number.isFinite(BARBOFUS_DEFAULT_FACE_ENTRY.female)
    ? BARBOFUS_DEFAULT_FACE_ENTRY.female
    : 105,
};

export const BARBOFUS_GENDER_VALUES = {
  male: 0,
  female: 1,
};

export const BARBOFUS_DEFAULT_GENDER_KEY =
  BARBOFUS_DEFAULTS.gender === BARBOFUS_GENDER_VALUES.male ? "male" : "female";

export const EMPTY_BREED_COLORS = Object.freeze({ numeric: [], hex: [] });

export const BARBOFUS_DEFAULT_BREED = Object.freeze({
  id: BARBOFUS_DEFAULTS.classId,
  name: "Eniripsa",
  slug: "eniripsa",
  icon: null,
  sortIndex: BARBOFUS_DEFAULTS.classId,
  male: {
    lookId: BARBOFUS_DEFAULTS.lookId,
    faceId: Number.isFinite(BARBOFUS_DEFAULT_FACE_ENTRY.male)
      ? BARBOFUS_DEFAULT_FACE_ENTRY.male
      : null,
    colors: EMPTY_BREED_COLORS,
  },
  female: {
    lookId: BARBOFUS_DEFAULTS.lookId,
    faceId: BARBOFUS_DEFAULTS.faceId,
    colors: EMPTY_BREED_COLORS,
  },
});

const LZ_KEY_STR_URI_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

function getUriSafeCharFromInt(value) {
  return LZ_KEY_STR_URI_SAFE.charAt(value);
}

function _compress(uncompressed, bitsPerChar, getCharFromInt) {
  if (uncompressed == null) {
    return "";
  }

  let i;
  const dictionary = Object.create(null);
  const dictionaryToCreate = Object.create(null);
  let c = "";
  let wc = "";
  let w = "";
  let enlargeIn = 2;
  let dictSize = 3;
  let numBits = 2;
  const data = [];
  let data_val = 0;
  let data_position = 0;

  const pushBits = (value, bits) => {
    for (i = 0; i < bits; i += 1) {
      data_val = (data_val << 1) | (value & 1);
      if (data_position === bitsPerChar - 1) {
        data_position = 0;
        data.push(getCharFromInt(data_val));
        data_val = 0;
      } else {
        data_position += 1;
      }
      value >>= 1;
    }
  };

  const writeDictionaryEntry = (entry) => {
    if (entry.charCodeAt(0) < 256) {
      pushBits(0, numBits);
      pushBits(entry.charCodeAt(0), 8);
    } else {
      pushBits(1, numBits);
      pushBits(entry.charCodeAt(0), 16);
    }
    enlargeIn -= 1;
    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits += 1;
    }
    delete dictionaryToCreate[entry];
  };

  for (let ii = 0; ii < uncompressed.length; ii += 1) {
    c = uncompressed.charAt(ii);
    if (!Object.prototype.hasOwnProperty.call(dictionary, c)) {
      dictionary[c] = dictSize;
      dictSize += 1;
      dictionaryToCreate[c] = true;
    }
    wc = w + c;
    if (Object.prototype.hasOwnProperty.call(dictionary, wc)) {
      w = wc;
    } else {
      if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, w)) {
        writeDictionaryEntry(w);
      } else {
        pushBits(dictionary[w], numBits);
      }

      enlargeIn -= 1;
      if (enlargeIn === 0) {
        enlargeIn = 1 << numBits;
        numBits += 1;
      }

      dictionary[wc] = dictSize;
      dictSize += 1;
      w = String(c);
    }
  }

  if (w !== "") {
    if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, w)) {
      writeDictionaryEntry(w);
    } else {
      pushBits(dictionary[w], numBits);
    }
  }

  pushBits(2, numBits);

  while (true) {
    data_val <<= 1;
    if (data_position === bitsPerChar - 1) {
      data.push(getCharFromInt(data_val));
      break;
    }
    data_position += 1;
  }

  return data.join("");
}

function compressToEncodedURIComponent(input) {
  if (input == null) {
    return "";
  }
  return _compress(input, 6, getUriSafeCharFromInt);
}

export function getBarbofusFaceId(classId, genderKey, fallback) {
  if (!Number.isFinite(classId)) {
    return Number.isFinite(fallback) ? fallback : null;
  }

  const entry = BARBOFUS_FACE_ID_BY_CLASS[classId];
  if (entry && Object.prototype.hasOwnProperty.call(entry, genderKey)) {
    const value = entry[genderKey];
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return Number.isFinite(fallback) ? fallback : null;
}

export function buildBarbofusLink(
  items,
  paletteHexes,
  fallbackColorValues = [],
  options = {}
) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const {
    useCustomSkinTone = true,
    classId = null,
    gender = BARBOFUS_DEFAULTS.gender,
    faceId = BARBOFUS_DEFAULTS.faceId,
    classDefaults = [],
  } = options;

  if (!Number.isFinite(classId)) {
    return null;
  }

  const paletteValues = Array.isArray(paletteHexes)
    ? paletteHexes
        .map((hex) => hexToNumeric(hex))
        .filter((value) => Number.isFinite(value))
    : [];

  const defaultColorValues = Array.isArray(classDefaults)
    ? classDefaults.filter((value) => Number.isFinite(value))
    : [];

  const fallbackValues = Array.isArray(fallbackColorValues)
    ? fallbackColorValues.filter((value) => Number.isFinite(value))
    : [];

  const overlayValues = paletteValues.length ? paletteValues : fallbackValues;
  const initialColors = new Array(MAX_ITEM_PALETTE_COLORS).fill(null);

  if (!useCustomSkinTone && defaultColorValues.length) {
    const defaultSkin = defaultColorValues.find((value) => Number.isFinite(value));
    if (defaultSkin !== undefined) {
      initialColors[0] = defaultSkin;
    }
  }

  const startIndex = !useCustomSkinTone && Number.isFinite(initialColors[0]) ? 1 : 0;

  overlayValues.forEach((value) => {
    if (!Number.isFinite(value)) {
      return;
    }
    if (initialColors.includes(value)) {
      return;
    }
    const targetIndex = initialColors.findIndex((entry, index) => entry === null && index >= startIndex);
    if (targetIndex !== -1) {
      initialColors[targetIndex] = value;
    }
  });

  if (initialColors.every((value) => value === null) && defaultColorValues.length) {
    defaultColorValues.forEach((value, index) => {
      if (index < MAX_ITEM_PALETTE_COLORS && Number.isFinite(value)) {
        initialColors[index] = value;
      }
    });
  }

  if (useCustomSkinTone && !defaultColorValues.length && !overlayValues.length) {
    return null;
  }

  const resolvedColors = initialColors.filter((value) => Number.isFinite(value));

  if (!resolvedColors.length && !useCustomSkinTone) {
    const defaultSkin = defaultColorValues.length ? defaultColorValues[0] : null;
    if (defaultSkin !== null) {
      resolvedColors.push(defaultSkin);
    }
  }

  if (!resolvedColors.length) {
    return null;
  }

  const equipment = BARBOFUS_EQUIPMENT_SLOTS.reduce((accumulator, slot) => {
    accumulator[slot] = null;
    return accumulator;
  }, {});

  let hasEquipment = false;

  items.forEach((item) => {
    if (!item) {
      return;
    }
    const slot = BARBOFUS_SLOT_BY_TYPE[item.slotType];
    if (!slot || !item.ankamaId) {
      return;
    }
    equipment[slot] = item.ankamaId;
    hasEquipment = true;
  });

  if (!hasEquipment) {
    return null;
  }

  const payload = {
    1: Number.isFinite(gender) ? gender : BARBOFUS_DEFAULTS.gender,
    2: classId,
    4: resolvedColors,
    5: equipment,
  };

  const resolvedFaceId = Number.isFinite(faceId) ? faceId : null;
  if (resolvedFaceId !== null) {
    payload[3] = resolvedFaceId;
  }

  try {
    const encoded = compressToEncodedURIComponent(JSON.stringify(payload));
    if (!encoded) {
      return null;
    }
    return `${BARBOFUS_BASE_URL}?s=${encoded}`;
  } catch (err) {
    console.error(err);
    return null;
  }
}
