/**
 * Shared thresholds for data freshness across the prediction pipeline.
 * Values match existing behavior — this is a pure refactor, not a semantic change.
 */

/** Primary staleness threshold: data older than this is considered stale */
export const STALE_THRESHOLD_HOURS = 2;
export const STALE_THRESHOLD_MS = STALE_THRESHOLD_HOURS * 60 * 60 * 1000;

/** Lag feature masking: mask lag features when data exceeds this age */
export const LAG_MASK_HOURS = 3;

/** Latest volume masking: mask latest measured volume when data exceeds this age */
export const LATEST_MASK_HOURS = 6;

/** Cross-station sum/avg: exclude stations with data older than this */
export const CROSS_STATION_MAX_AGE_HOURS = 4;
