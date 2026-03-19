"""
Ablation study: compare 4 feature-set variants.

1. baseline       - 18 original features
2. +signals       - baseline + 8 corridor lag features
3. +signals+internal_lags - variant 2 + sum_rv19_lag1h, sum_e6_lag1h
4. +all           - variant 3 + momentum_1h

Usage: python ablation.py
"""

import os
import sys
import json
from datetime import datetime

import lightgbm as lgb
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(SCRIPT_DIR, "..", "raw-history")
WEIGHTS_PATH = os.path.join(SCRIPT_DIR, "..", "..", "src", "data", "model-weights.json")
RESULTS_PATH = os.path.join(SCRIPT_DIR, "ablation-results.json")

from features import build_dataset_ablation, get_oslo_time, classify_day_type, compute_baseline, load_model_weights
from config import (
    ABLATION_CONFIGS,
    LGBM_PARAMS,
    N_ESTIMATORS,
    QUANTILE_ALPHAS,
    QUANTILE_LABELS,
    FEATURE_NAMES,
    STATION_ENCODING,
    MIN_VOLUME,
    TEST_MONTHS,
)


def compute_mape(actuals: np.ndarray, preds: np.ndarray) -> float:
    mask = np.abs(actuals) >= MIN_VOLUME
    if mask.sum() == 0:
        return 0.0
    return float(np.mean(np.abs(actuals[mask] - preds[mask]) / np.abs(actuals[mask])) * 100)


def compute_mae(actuals: np.ndarray, preds: np.ndarray) -> float:
    return float(np.mean(np.abs(actuals - preds)))


def train_variant(
    variant_name: str,
    feature_names: list[str],
) -> dict:
    """Train 3 quantile models for a variant, return metrics dict."""
    print(f"\n{'='*60}")
    print(f"VARIANT: {variant_name} ({len(feature_names)} features)")
    print(f"{'='*60}")

    X_train, y_train, X_test, y_test, fnames = build_dataset_ablation(
        raw_dir=RAW_DIR,
        weights_path=WEIGHTS_PATH,
        feature_names=feature_names,
    )

    if len(X_train) == 0:
        print("ERROR: No training data")
        return {"error": "no_data"}

    cat_idx = [fnames.index("station_id")] if "station_id" in fnames else []

    models = {}
    for alpha, label in zip(QUANTILE_ALPHAS, QUANTILE_LABELS):
        params = {**LGBM_PARAMS, "alpha": alpha}
        train_data = lgb.Dataset(
            X_train, label=y_train,
            categorical_feature=cat_idx,
            feature_name=fnames,
        )
        model = lgb.train(params, train_data, num_boost_round=N_ESTIMATORS)
        models[label] = model

    # p50 predictions for main metrics
    preds_p50 = models["p50"].predict(X_test)
    preds_p10 = models["p10"].predict(X_test)
    preds_p90 = models["p90"].predict(X_test)

    # We need baseline predictions to convert residuals to absolute volumes
    # baseline is the first feature (index 0) in all variants
    baseline_idx = fnames.index("baseline_prediction")
    baselines = X_test[:, baseline_idx]

    vol_actual = baselines + y_test
    vol_pred = baselines + preds_p50

    # Overall metrics
    total_mae = compute_mae(vol_actual, vol_pred)
    total_mape = compute_mape(vol_actual, vol_pred)

    # Calibration
    cal_p10 = float(np.mean(y_test < preds_p10))
    cal_p90 = float(np.mean(y_test < preds_p90))

    # Segment MAPE: need hour and weekday from features
    hour_idx = fnames.index("hour")
    is_rush_idx = fnames.index("is_rush")
    station_idx = fnames.index("station_id")

    hours = X_test[:, hour_idx]
    is_rush = X_test[:, is_rush_idx]
    stations = X_test[:, station_idx]

    # Segments
    rush_mask = is_rush == 1
    evening_mask = (hours >= 19) & (hours <= 22)
    # Weekend: weekday feature (JS-style: Sun=0, Sat=6)
    weekday_idx = fnames.index("weekday")
    weekdays = X_test[:, weekday_idx]
    weekend_mask = (weekdays == 0) | (weekdays == 6)

    # Deviation: >20% over or under baseline
    ratio = vol_actual / np.maximum(baselines, 1)
    deviation_mask = (ratio > 1.2) | (ratio < 0.8)

    segment_mapes = {}
    for seg_name, seg_mask in [
        ("rush_15_17", (hours >= 15) & (hours <= 17)),
        ("rush_all", rush_mask),
        ("evening", evening_mask),
        ("weekend", weekend_mask),
        ("deviation_gt20pct", deviation_mask),
    ]:
        if seg_mask.sum() > 0:
            segment_mapes[seg_name] = compute_mape(vol_actual[seg_mask], vol_pred[seg_mask])
        else:
            segment_mapes[seg_name] = None

    # Per-station MAPE
    station_encoding_inv = {v: k for k, v in STATION_ENCODING.items()}
    per_station_mapes = {}
    for enc_val in np.unique(stations):
        sid = station_encoding_inv.get(int(enc_val), f"unknown_{int(enc_val)}")
        mask = stations == enc_val
        if mask.sum() > 0:
            per_station_mapes[sid] = compute_mape(vol_actual[mask], vol_pred[mask])

    # Feature importance (p50 model)
    importance = models["p50"].feature_importance(importance_type="gain")
    fi = dict(zip(fnames, [float(x) for x in importance]))

    result = {
        "variant": variant_name,
        "n_features": len(feature_names),
        "features": feature_names,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "total_mae": round(total_mae, 2),
        "total_mape": round(total_mape, 2),
        "calibration_p10": round(cal_p10, 4),
        "calibration_p90": round(cal_p90, 4),
        "segment_mapes": {k: round(v, 2) if v is not None else None for k, v in segment_mapes.items()},
        "per_station_mapes": {k: round(v, 2) for k, v in per_station_mapes.items()},
        "feature_importance_top10": dict(sorted(fi.items(), key=lambda x: -x[1])[:10]),
    }

    print(f"\n  Total MAE:  {total_mae:.2f}")
    print(f"  Total MAPE: {total_mape:.2f}%")
    print(f"  Cal p10:    {cal_p10:.3f} (target ~0.10)")
    print(f"  Cal p90:    {cal_p90:.3f} (target ~0.90)")

    return result


def print_comparison(results: list[dict]) -> None:
    """Print comparison table."""
    baseline = results[0]

    print(f"\n\n{'='*80}")
    print("ABLATION COMPARISON")
    print(f"{'='*80}\n")

    # Header
    print(f"{'Variant':<30} {'#feat':>5} {'MAE':>8} {'MAPE%':>8} {'dMAE':>8} {'dMAPE':>8}")
    print("-" * 75)

    for r in results:
        if "error" in r:
            print(f"{r['variant']:<30} ERROR")
            continue
        d_mae = r["total_mae"] - baseline["total_mae"]
        d_mape = r["total_mape"] - baseline["total_mape"]
        print(f"{r['variant']:<30} {r['n_features']:>5} {r['total_mae']:>8.2f} {r['total_mape']:>7.2f}% {d_mae:>+7.2f} {d_mape:>+7.2f}%")

    # Segment breakdown
    print(f"\n{'Segment MAPE':<30}", end="")
    for r in results:
        if "error" not in r:
            print(f" {r['variant']:>14}", end="")
    print()
    print("-" * (30 + 15 * len(results)))

    segments = list(results[0].get("segment_mapes", {}).keys())
    for seg in segments:
        print(f"  {seg:<28}", end="")
        for r in results:
            if "error" in r:
                continue
            val = r["segment_mapes"].get(seg)
            if val is not None:
                print(f" {val:>13.2f}%", end="")
            else:
                print(f" {'N/A':>14}", end="")
        print()

    # Per-station
    print(f"\n{'Per-station MAPE':<30}", end="")
    for r in results:
        if "error" not in r:
            print(f" {r['variant']:>14}", end="")
    print()
    print("-" * (30 + 15 * len(results)))

    all_stations = sorted(set().union(*(r.get("per_station_mapes", {}).keys() for r in results if "error" not in r)))
    for sid in all_stations:
        short = sid[:16]
        print(f"  {short:<28}", end="")
        for r in results:
            if "error" in r:
                continue
            val = r["per_station_mapes"].get(sid)
            if val is not None:
                print(f" {val:>13.2f}%", end="")
            else:
                print(f" {'N/A':>14}", end="")
        print()

    # Calibration
    print(f"\n{'Calibration':<30}", end="")
    for r in results:
        if "error" not in r:
            print(f" {r['variant']:>14}", end="")
    print()
    print("-" * (30 + 15 * len(results)))
    for metric in ["calibration_p10", "calibration_p90"]:
        target = "~0.10" if "p10" in metric else "~0.90"
        print(f"  {metric} ({target})", end="")
        pad = 28 - len(f"{metric} ({target})")
        print(" " * pad, end="")
        for r in results:
            if "error" in r:
                continue
            print(f" {r[metric]:>14.4f}", end="")
        print()


def main() -> None:
    print("=== Moss Trafikk Ablation Study ===")
    print(f"Timestamp: {datetime.now().isoformat()}")

    results = []
    for variant_name, feature_list in ABLATION_CONFIGS.items():
        result = train_variant(variant_name, feature_list)
        results.append(result)

    print_comparison(results)

    # Save JSON results
    output = {
        "timestamp": datetime.now().isoformat(),
        "variants": results,
    }
    with open(RESULTS_PATH, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nResults saved to {RESULTS_PATH}")


if __name__ == "__main__":
    main()
