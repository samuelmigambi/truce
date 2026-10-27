/** PayPal's line: at 1.5% claims with more than 100 sales over three months, fees go up. */
export const RATIO_LINE = 0.015;
export const RATIO_MIN_SALES = 100;

export interface RatioState {
  /** Claims over sales in the last three months, 0 to 1. */
  ratio: number;
  /** The shop now pays the high-volume dispute fee. */
  highVolume: boolean;
  /** More claims the shop can take before crossing the line at today's sales. */
  headroom: number;
}

export function claimsRatio(sales: number, claims: number): RatioState {
  const ratio = sales > 0 ? claims / sales : 0;
  const highVolume = sales > RATIO_MIN_SALES && ratio >= RATIO_LINE;
  // The most claims that stay under the line; the line itself counts as crossing it.
  const maxClaims = Math.ceil(sales * RATIO_LINE) - 1;
  return { ratio, highVolume, headroom: Math.max(0, maxClaims - claims) };
}
