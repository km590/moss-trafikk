"""
Export LightGBM models to compact JSON for TypeScript tree-walker.
"""

from datetime import datetime, timezone
from typing import Any

import numpy as np
import orjson

from config import CATEGORICAL_FEATURES, FEATURE_NAMES, FULL_DATA_STATIONS

UTC = timezone.utc


def convert_tree(node: dict) -> dict:
    """Convert LightGBM tree node to compact format."""
    if "leaf_value" in node:
        return {"lv": round(float(node["leaf_value"]), 2)}

    split_feature = node["split_feature"]
    decision_type = node.get("decision_type", "<=")

    result: dict[str, Any] = {"sf": split_feature}

    if decision_type == "==":
        # Categorical split: threshold is string like "0||1||3"
        cats = [int(c) for c in str(node["threshold"]).split("||")]
        result["cat"] = cats
    else:
        result["th"] = round(float(node["threshold"]), 2)

    result["lc"] = convert_tree(node["left_child"])
    result["rc"] = convert_tree(node["right_child"])
    return result


def _compute_metrics(
    models: dict,
    X_test: np.ndarray,
    y_test: np.ndarray,
) -> dict:
    """Compute test set metrics for all quantile models."""
    metrics = {}
    p50_model = models.get("p50")
    if p50_model is not None:
        preds_p50 = p50_model.predict(X_test)
        residuals = y_test
        actuals_approx = residuals  # residuals, not absolute volumes

        # MAPE on residuals is not meaningful, compute MAE and coverage instead
        mae = float(np.mean(np.abs(preds_p50 - residuals)))
        metrics["mae_p50"] = round(mae, 2)

    p10_model = models.get("p10")
    p90_model = models.get("p90")
    if p10_model is not None and p90_model is not None:
        preds_p10 = p10_model.predict(X_test)
        preds_p90 = p90_model.predict(X_test)
        coverage_90 = float(np.mean((y_test >= preds_p10) & (y_test <= preds_p90)))
        metrics["interval_coverage_80pct"] = round(coverage_90, 4)
        below_p10 = float(np.mean(y_test < preds_p10))
        above_p90 = float(np.mean(y_test > preds_p90))
        metrics["calibration_p10"] = round(below_p10, 4)
        metrics["calibration_p90"] = round(1.0 - above_p90, 4)

    metrics["n_test"] = int(len(y_test))
    return metrics


def export_model(
    models: dict,
    feature_names: list[str],
    X_test: np.ndarray,
    y_test: np.ndarray,
    output_path: str,
) -> None:
    """Export 3 quantile models to single JSON file."""

    result: dict[str, Any] = {
        "version": "2.0.0",
        "trainedAt": datetime.now(UTC).isoformat(),
        "features": feature_names,
        "categoricalFeatures": CATEGORICAL_FEATURES,
        "quantiles": {},
        "stationsWithResidual": FULL_DATA_STATIONS,
        "metrics": _compute_metrics(models, X_test, y_test),
    }

    for label, model in models.items():
        model_dump = model.dump_model()
        trees = []
        for tree_info in model_dump["tree_info"]:
            tree_struct = tree_info.get("tree_structure")
            if tree_struct is not None:
                trees.append(convert_tree(tree_struct))
        result["quantiles"][label] = {"trees": trees}
        print(f"  Exported {label}: {len(trees)} trees")

    output_bytes = orjson.dumps(result)
    with open(output_path, "wb") as f:
        f.write(output_bytes)

    size_kb = len(output_bytes) / 1024
    print(f"Exported to {output_path} ({size_kb:.1f} KB)")
