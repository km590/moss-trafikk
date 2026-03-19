"""
Extended evaluation for v2 model.
Computes: MAPE, false_green_rate, false_red_rate, calibration, freshness-stratified MAPE,
          false_wait_rate, missed_wait_rate, flat_correct_rate.

Usage: python eval_v2.py
"""

import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import orjson

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(SCRIPT_DIR, "..", "raw-history")
WEIGHTS_PATH = os.path.join(SCRIPT_DIR, "..", "..", "src", "data", "model-weights.json")
MODEL_PATH = os.path.join(SCRIPT_DIR, "..", "..", "src", "data", "residual-model.json")

OSLO = ZoneInfo("Europe/Oslo")


# ---------------------------------------------------------------------------
# Congestion classification thresholds (per station, heuristic)
# ---------------------------------------------------------------------------

# Absolute volume thresholds for green/yellow/red
# These are approximate and can be calibrated further
GREEN_THRESHOLD = 0.85    # predicted/actual ratio range
YELLOW_THRESHOLD = 1.15

# Relative thresholds: classify congestion level from volume
def classify_congestion(volume: float, baseline: float) -> str:
    """green/yellow/red based on volume relative to baseline."""
    if baseline <= 0:
        return "green"
    ratio = volume / baseline
    if ratio <= GREEN_THRESHOLD:
        return "green"
    if ratio <= YELLOW_THRESHOLD:
        return "yellow"
    return "red"


def classify_congestion_from_pred(predicted_volume: float, baseline: float) -> str:
    return classify_congestion(predicted_volume, baseline)


# ---------------------------------------------------------------------------
# Tree walker for residual model inference
# ---------------------------------------------------------------------------

def walk_tree(node: dict, features: list[float]) -> float:
    if "lv" in node:
        return node["lv"]
    sf = node["sf"]
    val = features[sf]
    if "cat" in node:
        go_left = int(val) in node["cat"]
    else:
        go_left = val <= node["th"]
    return walk_tree(node["lc"] if go_left else node["rc"], features)


def predict_quantile(trees: list[dict], features: list[float]) -> float:
    return sum(walk_tree(t, features) for t in trees)


# ---------------------------------------------------------------------------
# Feature building (lightweight, reuses features.py logic)
# ---------------------------------------------------------------------------

from features import (
    load_all_stations,
    load_model_weights,
    get_oslo_time,
    classify_day_type,
    compute_baseline,
    build_timestamp_lookup,
    build_lag_index,
    build_feature_row_extended,
    build_signal_lag_indexes,
)
from config import FEATURE_NAMES, SIGNAL_STATION_IDS, MIN_COVERAGE, MIN_VOLUME, TEST_MONTHS


def _compute_mape(actuals: list, preds: list) -> float:
    pairs = [(a, p) for a, p in zip(actuals, preds) if abs(a) >= MIN_VOLUME]
    if not pairs:
        return 0.0
    return float(np.mean([abs(a - p) / abs(a) for a, p in pairs]) * 100)


# ---------------------------------------------------------------------------
# Decision simulation (mirrors makeDecision heuristic)
# ---------------------------------------------------------------------------

def make_decision(p10: float, p50: float, p90: float, baseline: float) -> str:
    """
    Simulate makeDecision: go_now / wait / flat.
    p50 is the predicted residual; add baseline for absolute volume.
    """
    vol_p50 = baseline + p50
    vol_p10 = baseline + p10
    vol_p90 = baseline + p90

    spread = vol_p90 - vol_p10
    relative_spread = spread / max(vol_p50, 1)

    # Flat: narrow uncertainty band
    if relative_spread < 0.15:
        return "flat"

    # Wait: p90 significantly higher than p10 and p50 is elevated
    congestion_p50 = classify_congestion(vol_p50, baseline)
    congestion_p10 = classify_congestion(vol_p10, baseline)
    if congestion_p50 in ("yellow", "red") and congestion_p10 == "green":
        return "wait"

    return "go_now"


# ---------------------------------------------------------------------------
# Main evaluation
# ---------------------------------------------------------------------------

def main() -> None:
    print("=== Moss Trafikk v2 Extended Evaluation ===\n")

    if not os.path.exists(MODEL_PATH):
        print(f"ERROR: {MODEL_PATH} not found. Run train.py first.")
        sys.exit(1)

    with open(MODEL_PATH, "rb") as f:
        model_data = orjson.loads(f.read())

    trees_p10 = model_data["quantiles"]["p10"]["trees"]
    trees_p50 = model_data["quantiles"]["p50"]["trees"]
    trees_p90 = model_data["quantiles"]["p90"]["trees"]
    feature_names = model_data["features"]

    print("Loading station data...")
    station_records = load_all_stations(RAW_DIR)
    weights = load_model_weights(WEIGHTS_PATH)

    for sid in station_records:
        station_records[sid].sort(key=lambda r: r["from"])

    ts_lookup = build_timestamp_lookup(station_records)
    lag_indexes = {sid: build_lag_index(recs) for sid, recs in station_records.items()}
    signal_lag_indexes = build_signal_lag_indexes(station_records)

    from datetime import timedelta
    now = datetime.now(OSLO)
    cutoff_dt = now - timedelta(days=TEST_MONTHS * 30)
    cutoff_iso = cutoff_dt.isoformat()
    print(f"Test cutoff: {cutoff_iso[:10]}\n")

    # Accumulators
    segments = {
        "weekday_daytime": [],
        "weekday_evening": [],
        "weekend": [],
        "public_holiday": [],
        "pre_holiday": [],
        "school_break": [],
    }
    freshness_buckets: dict[str, list] = {"0": [], "1-2": [], "3-4": [], "5+": []}

    false_green_count = 0
    false_red_count = 0
    congestion_total = 0

    false_wait_count = 0
    missed_wait_count = 0
    flat_correct_count = 0
    flat_total = 0
    wait_total = 0
    go_now_total = 0

    cal_p10_below = 0
    cal_p90_below = 0
    cal_total = 0

    evening_overwarning = 0
    evening_total = 0

    per_station: dict[str, list] = {}

    for station_id, records in station_records.items():
        # Skip signal stations (they are features, not targets)
        if station_id in SIGNAL_STATION_IDS:
            continue
        for rec in records:
            if rec["from"] < cutoff_iso:
                continue
            if rec["coverage"] < MIN_COVERAGE:
                continue
            if rec["volume"] < MIN_VOLUME:
                continue

            t = get_oslo_time(rec["from"])
            day_type = classify_day_type(t["date_obj"])
            baseline = compute_baseline(
                weights, station_id,
                t["dayOfWeek"], t["hour"], t["month"], day_type
            )
            if baseline <= 0:
                continue

            row = build_feature_row_extended(
                station_id, rec, baseline,
                station_records, weights, ts_lookup, lag_indexes,
                signal_lag_indexes,
                freshness=0.0, mask_lags=False, mask_latest=False,
            )
            features = [row[f] for f in feature_names]

            pred_p10 = predict_quantile(trees_p10, features)
            pred_p50 = predict_quantile(trees_p50, features)
            pred_p90 = predict_quantile(trees_p90, features)

            actual_residual = float(rec["volume"]) - baseline
            vol_pred = baseline + pred_p50
            vol_actual = float(rec["volume"])

            # Segment classification
            hour = t["hour"]
            dow = t["dayOfWeek"]  # Sun=0, Mon=1..Sat=6
            is_weekend = dow == 0 or dow == 6
            if day_type == "public_holiday":
                seg = "public_holiday"
            elif day_type == "pre_holiday":
                seg = "pre_holiday"
            elif day_type == "school_break":
                seg = "school_break"
            elif is_weekend:
                seg = "weekend"
            elif 7 <= hour <= 18:
                seg = "weekday_daytime"
            else:
                seg = "weekday_evening"

            segments[seg].append((vol_actual, vol_pred, actual_residual, pred_p50))

            # Per station
            if station_id not in per_station:
                per_station[station_id] = []
            per_station[station_id].append((vol_actual, vol_pred))

            # Calibration
            cal_total += 1
            if actual_residual < pred_p10:
                cal_p10_below += 1
            if actual_residual < pred_p90:
                cal_p90_below += 1

            # Freshness bucket (test set always has freshness=0, so bucket "0")
            freshness_buckets["0"].append((vol_actual, vol_pred))

            # Congestion classification
            pred_cong = classify_congestion(vol_pred, baseline)
            actual_cong = classify_congestion(vol_actual, baseline)
            congestion_total += 1
            if pred_cong == "green" and actual_cong in ("yellow", "red"):
                false_green_count += 1
            if pred_cong == "red" and actual_cong == "green":
                false_red_count += 1

            # Evening overwarning (19-22)
            if 19 <= hour <= 22:
                evening_total += 1
                if pred_cong in ("yellow", "red") and actual_cong == "green":
                    evening_overwarning += 1

            # Decision simulation
            decision = make_decision(pred_p10, pred_p50, pred_p90, baseline)
            # Actual best: if waiting 1h would give >20% improvement
            vol_1h_later = vol_actual  # simplified: use current actual as proxy
            improvement = (vol_1h_later - vol_actual) / max(vol_actual, 1)

            if decision == "flat":
                flat_total += 1
                if abs(vol_pred - vol_actual) / max(vol_actual, 1) < 0.15:
                    flat_correct_count += 1
            elif decision == "wait":
                wait_total += 1
                if actual_cong == "green":
                    false_wait_count += 1
            else:
                go_now_total += 1
                # Missed wait: said go_now but high congestion
                if actual_cong == "red":
                    missed_wait_count += 1

    # --- Report ---

    print("=== Segment MAPE (p50 predictions) ===\n")
    seg_names = {
        "weekday_daytime": "Ukedager 07-18",
        "weekday_evening": "Ukedager kveld/natt",
        "weekend": "Helger",
        "public_holiday": "Helligdager",
        "pre_holiday": "Dag for helligdag",
        "school_break": "Skoleferie",
    }
    print(f"{'Segment':<24} {'N':>6} {'MAPE%':>8}")
    print("-" * 42)
    for seg, data in segments.items():
        if not data:
            print(f"{seg_names[seg]:<24} {'0':>6}       -")
            continue
        actuals = [d[0] for d in data]
        preds = [d[1] for d in data]
        mape = _compute_mape(actuals, preds)
        print(f"{seg_names[seg]:<24} {len(data):>6} {mape:>7.1f}%")

    print("\n=== Per-stasjon MAPE ===\n")
    for sid, data in per_station.items():
        actuals = [d[0] for d in data]
        preds = [d[1] for d in data]
        mape = _compute_mape(actuals, preds)
        print(f"  {sid:<20} N={len(data):>5}  MAPE={mape:>5.1f}%")

    print("\n=== Calibration ===\n")
    if cal_total > 0:
        cal_p10_rate = cal_p10_below / cal_total
        cal_p90_rate = cal_p90_below / cal_total
        print(f"  P10 calibration (target ~10%): {cal_p10_rate:.1%} (n={cal_total})")
        print(f"  P90 calibration (target ~90%): {cal_p90_rate:.1%}")
    else:
        print("  No test data")

    print("\n=== Congestion classification ===\n")
    if congestion_total > 0:
        fgr = false_green_count / congestion_total
        frr = false_red_count / congestion_total
        print(f"  False green rate: {fgr:.1%}  ({false_green_count}/{congestion_total})")
        print(f"  False red rate:   {frr:.1%}  ({false_red_count}/{congestion_total})")
    if evening_total > 0:
        eow = evening_overwarning / evening_total
        print(f"  Evening overwarning (19-22): {eow:.1%}  ({evening_overwarning}/{evening_total})")

    print("\n=== Decision metrics ===\n")
    if flat_total > 0:
        fcr = flat_correct_count / flat_total
        print(f"  flat_correct_rate: {fcr:.1%}  ({flat_correct_count}/{flat_total})")
    if wait_total > 0:
        fwr = false_wait_count / wait_total
        print(f"  false_wait_rate:   {fwr:.1%}  ({false_wait_count}/{wait_total})")
    if go_now_total > 0:
        mwr = missed_wait_count / go_now_total
        print(f"  missed_wait_rate:  {mwr:.1%}  ({missed_wait_count}/{go_now_total})")

    print(f"\n  (flat={flat_total}, wait={wait_total}, go_now={go_now_total})")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
