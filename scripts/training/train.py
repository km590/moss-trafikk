"""
Train 3 LightGBM quantile regression models on residuals.
Usage: python scripts/training/train.py
       (or from scripts/training/: python train.py)
"""

import os
import sys

import lightgbm as lgb
import numpy as np

# Resolve paths relative to this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(SCRIPT_DIR, "..", "raw-history")
WEIGHTS_PATH = os.path.join(SCRIPT_DIR, "..", "..", "src", "data", "model-weights.json")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "..", "src", "data", "residual-model.json")

from features import build_dataset
from config import LGBM_PARAMS, N_ESTIMATORS, QUANTILE_ALPHAS, QUANTILE_LABELS, FEATURE_NAMES
from export_model import export_model


def _compute_mape(actuals: np.ndarray, preds: np.ndarray) -> float:
    mask = actuals != 0
    if mask.sum() == 0:
        return 0.0
    return float(np.mean(np.abs(actuals[mask] - preds[mask]) / np.abs(actuals[mask])) * 100)


def main() -> None:
    print("=== Moss Trafikk v2 Training Pipeline ===\n")

    X_train, y_train, X_test, y_test, feature_names = build_dataset(
        raw_dir=RAW_DIR,
        weights_path=WEIGHTS_PATH,
    )

    print(f"\nTraining set: {len(X_train)} samples")
    print(f"Test set:     {len(X_test)} samples")

    if len(X_train) == 0:
        print("ERROR: No training data. Check raw-history files and MIN_RECORDS_FOR_TRAINING.")
        sys.exit(1)

    # Feature index for categorical
    cat_feature_index = [feature_names.index("station_id")]

    models = {}
    for alpha, label in zip(QUANTILE_ALPHAS, QUANTILE_LABELS):
        print(f"\n--- Training {label} (alpha={alpha}) ---")
        params = {**LGBM_PARAMS, "alpha": alpha}

        train_data = lgb.Dataset(
            X_train,
            label=y_train,
            categorical_feature=cat_feature_index,
            feature_name=feature_names,
        )

        model = lgb.train(
            params,
            train_data,
            num_boost_round=N_ESTIMATORS,
        )
        models[label] = model

        preds = model.predict(X_test)
        mape = _compute_mape(y_test, preds)
        mae = float(np.mean(np.abs(preds - y_test)))
        print(f"  Test MAE={mae:.2f}  MAPE={mape:.1f}%  (on residuals)")

    print("\n=== Exporting models ===")
    export_model(models, feature_names, X_test, y_test, output_path=OUTPUT_PATH)

    print("\n=== Done ===")
    print(f"Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
