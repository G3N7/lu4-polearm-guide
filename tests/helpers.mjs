import { readGuide, load } from '../scripts/guide.mjs';

export const html = readGuide();
export const $ = load(html);
