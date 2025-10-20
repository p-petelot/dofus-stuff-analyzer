import cjsModule from "./index.js";

const api = cjsModule?.default ?? cjsModule;

export const buildVisionIndexFromGenerations = api.buildVisionIndexFromGenerations;
export const loadVisionIndex = api.loadVisionIndex;
export const clearVisionIndexCache = api.clearVisionIndexCache;
export const cosineSimilarity = api.cosineSimilarity;
export const readVisionIndex = api.readVisionIndex;

export default api;
