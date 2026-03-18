"""
Feature engineering for Moss Trafikk v2 residual model.
"""

import os
import random
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

import orjson
import numpy as np

from config import (
    FEATURE_NAMES,
    STATION_ENCODING,
    DAY_TYPE_ENCODING,
    RV19_IDS,
    E6_IDS,
    CENTRUM_IDS,
    MIN_RECORDS_FOR_TRAINING,
    MIN_COVERAGE,
    MIN_VOLUME,
    TEST_MONTHS,
    FRESHNESS_SIMULATION,
)

OSLO = ZoneInfo("Europe/Oslo")


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def load_all_stations(raw_dir: str) -> dict[str, list[dict]]:
    """Load all station raw history files, return {stationId: [records]}."""
    result = {}
    for fname in os.listdir(raw_dir):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(raw_dir, fname)
        with open(fpath, "rb") as f:
            data = orjson.loads(f.read())
        station_id = data["stationId"]
        result[station_id] = data.get("records", [])
    return result


def load_model_weights(weights_path: str) -> dict:
    """Load model-weights.json."""
    with open(weights_path, "rb") as f:
        return orjson.loads(f.read())


# ---------------------------------------------------------------------------
# Oslo timezone helpers
# ---------------------------------------------------------------------------

def get_oslo_time(iso_str: str) -> dict:
    """Parse ISO string to {dayOfWeek, hour, month, date_obj} in Oslo timezone."""
    dt = datetime.fromisoformat(iso_str)
    dt_oslo = dt.astimezone(OSLO)
    d = dt_oslo.date()
    # JS-style: Sun=0, Mon=1, ..., Sat=6
    # Python weekday(): Mon=0 ... Sun=6 -> (py+1) % 7
    py_dow = d.weekday()
    js_dow = (py_dow + 1) % 7
    return {
        "dayOfWeek": js_dow,
        "hour": dt_oslo.hour,
        "month": dt_oslo.month - 1,  # 0-indexed
        "date_obj": d,
        "year": dt_oslo.year,
    }


def _js_day_of_week(d: date) -> int:
    """Return JS-style day of week: Sun=0, Mon=1, ..., Sat=6."""
    # Python weekday(): Mon=0 ... Sun=6
    py = d.weekday()
    return (py + 1) % 7


# ---------------------------------------------------------------------------
# Calendar logic (mirrors validate-model.ts / compute-model exactly)
# ---------------------------------------------------------------------------

def _compute_easter_sunday(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return date(year, month, day)


def _date_key(d: date) -> str:
    return d.isoformat()


def _get_public_holidays(year: int) -> list[date]:
    easter = _compute_easter_sunday(year)
    def offset(base: date, days: int) -> date:
        return base + timedelta(days=days)
    return [
        date(year, 1, 1),
        offset(easter, -3),   # Skjaertorsdag
        offset(easter, -2),   # Langfredag
        easter,               # Paske
        offset(easter, 1),    # Annen paaskedag
        date(year, 5, 1),     # Arbeidernes dag
        date(year, 5, 17),    # Grunnlovsdag
        offset(easter, 39),   # Kristi himmelfartsdag
        offset(easter, 49),   # Pinse
        offset(easter, 50),   # Annen pinsedag
        date(year, 12, 25),   # Julaften
        date(year, 12, 26),   # Annen juledag
    ]


def _get_pre_holiday_keys(year: int) -> set[str]:
    holidays = _get_public_holidays(year)
    holiday_set = {_date_key(h) for h in holidays}
    keys = set()
    for h in holidays:
        prev = h - timedelta(days=1)
        dow = _js_day_of_week(prev)
        # weekday in JS: Mon=1..Fri=5
        if 1 <= dow <= 5 and _date_key(prev) not in holiday_set:
            keys.add(_date_key(prev))
    return keys


def _is_school_break(d: date) -> bool:
    year = d.year
    month = d.month
    day = d.day
    # Summer: June 20 - Aug 18
    if (month == 6 and day >= 20) or month == 7 or (month == 8 and day <= 18):
        return True
    # Christmas: Dec 21 - Jan 2
    if month == 12 and day >= 21:
        return True
    if month == 1 and day <= 2:
        return True
    # Week number (matching TS logic)
    jan1 = date(year, 1, 1)
    day_of_year = (d - jan1).days
    week_num = (day_of_year + jan1.weekday() + 1) // 7 + 1
    # Winter break: week 8; Autumn break: week 40
    if week_num in (8, 40):
        return True
    return False


def classify_day_type(date_obj: date) -> str:
    """Classify as public_holiday/pre_holiday/school_break/normal."""
    key = _date_key(date_obj)
    year = date_obj.year
    if any(_date_key(h) == key for h in _get_public_holidays(year)):
        return "public_holiday"
    if key in _get_pre_holiday_keys(year):
        return "pre_holiday"
    if _is_school_break(date_obj):
        return "school_break"
    return "normal"


# ---------------------------------------------------------------------------
# Baseline prediction (mirrors predictVolume in validate-model.ts)
# ---------------------------------------------------------------------------

def compute_baseline(
    weights: dict,
    station_id: str,
    day_of_week: int,
    hour: int,
    month: int,
    day_type: str,
) -> float:
    """Replicate TS predictVolume: median * monthFactor * holidayFactor."""
    base_patterns = weights.get("basePatterns", {})
    station_patterns = base_patterns.get(station_id, {})
    day_patterns = station_patterns.get(str(day_of_week), {})
    hour_data = day_patterns.get(str(hour), {})
    base = hour_data.get("median", 0)
    if base == 0:
        return 0.0
    month_factor = weights.get("monthFactors", {}).get(str(month), 1.0)
    holiday_factor = 1.0
    if day_type != "normal":
        holiday_factor = weights.get("holidayFactors", {}).get(day_type, 1.0)
    return base * month_factor * holiday_factor


# ---------------------------------------------------------------------------
# Cross-station lookup
# ---------------------------------------------------------------------------

def build_timestamp_lookup(station_records: dict[str, list[dict]]) -> dict[str, dict[str, float]]:
    """
    Build {iso_timestamp -> {stationId: volume}} for fast cross-station lookups.
    Only includes records that pass quality filters.
    """
    lookup: dict[str, dict[str, float]] = {}
    for station_id, records in station_records.items():
        for rec in records:
            if rec["coverage"] < MIN_COVERAGE:
                continue
            ts = rec["from"]
            if ts not in lookup:
                lookup[ts] = {}
            lookup[ts][station_id] = float(rec["volume"])
    return lookup


def _avg_of_ids(ts_lookup: dict, timestamp: str, ids: list[str], exclude_id: str) -> float:
    """Average volume of station IDs at timestamp, excluding the target station."""
    ts_data = ts_lookup.get(timestamp, {})
    vals = [ts_data[sid] for sid in ids if sid in ts_data and sid != exclude_id]
    return float(np.mean(vals)) if vals else -1.0


def _sum_of_ids(ts_lookup: dict, timestamp: str, ids: list[str], exclude_id: str) -> float:
    """Sum of volumes for station IDs at timestamp, excluding the target station."""
    ts_data = ts_lookup.get(timestamp, {})
    vals = [ts_data[sid] for sid in ids if sid in ts_data and sid != exclude_id]
    return float(sum(vals)) if vals else -1.0


# ---------------------------------------------------------------------------
# Lag helpers
# ---------------------------------------------------------------------------

def build_lag_index(records: list[dict]) -> dict[str, float]:
    """Build {iso_timestamp: volume} index for a single station's records."""
    return {rec["from"]: float(rec["volume"]) for rec in records if rec["coverage"] >= MIN_COVERAGE}


def _hour_before(iso_str: str, hours: int = 1) -> str:
    """Return ISO string for N hours before the given timestamp."""
    dt = datetime.fromisoformat(iso_str)
    return (dt - timedelta(hours=hours)).isoformat()


# ---------------------------------------------------------------------------
# Main feature builder
# ---------------------------------------------------------------------------

def build_feature_row(
    station_id: str,
    record: dict,
    baseline: float,
    station_records: dict[str, list[dict]],
    weights: dict,
    ts_lookup: dict[str, dict[str, float]],
    lag_indexes: dict[str, dict[str, float]],
    freshness: float = 0.0,
    mask_lags: bool = False,
    mask_latest: bool = False,
) -> dict:
    """Build one feature row. Returns dict with all feature values."""
    t = get_oslo_time(record["from"])
    day_type = classify_day_type(t["date_obj"])
    hour = t["hour"]

    # Lag features
    lag_index = lag_indexes.get(station_id, {})
    if mask_lags:
        lag_1h = lag_2h = lag_3h = -1.0
    else:
        lag_1h = lag_index.get(_hour_before(record["from"], 1), -1.0)
        lag_2h = lag_index.get(_hour_before(record["from"], 2), -1.0)
        lag_3h = lag_index.get(_hour_before(record["from"], 3), -1.0)

    # Latest measured volume: most recent lag that exists, or -1
    if mask_latest or mask_lags:
        latest_measured = -1.0
    else:
        latest_measured = lag_1h if lag_1h >= 0 else (lag_2h if lag_2h >= 0 else (lag_3h if lag_3h >= 0 else -1.0))

    # Cross-station features
    ts = record["from"]
    sum_rv19 = _sum_of_ids(ts_lookup, ts, RV19_IDS, station_id)
    sum_e6 = _sum_of_ids(ts_lookup, ts, E6_IDS, station_id)
    centrum_pressure = _avg_of_ids(ts_lookup, ts, CENTRUM_IDS, station_id)

    # Neighbor avg: all stations at same timestamp
    all_ids = list(ts_lookup.get(ts, {}).keys())
    neighbor_avg = _avg_of_ids(ts_lookup, ts, all_ids, station_id)

    return {
        "baseline_prediction": baseline,
        "station_id": STATION_ENCODING.get(station_id, 0),
        "weekday": t["dayOfWeek"],
        "hour": hour,
        "month": t["month"],
        "day_type": DAY_TYPE_ENCODING.get(day_type, 0),
        "is_rush": 1 if hour in (7, 8, 15, 16, 17) else 0,
        "is_evening": 1 if hour in (19, 20, 21, 22) else 0,
        "latest_measured_volume": latest_measured,
        "freshness": freshness,
        "coverage": float(record["coverage"]),
        "lag_1h": lag_1h,
        "lag_2h": lag_2h,
        "lag_3h": lag_3h,
        "sum_rv19": sum_rv19,
        "sum_e6": sum_e6,
        "centrum_pressure": centrum_pressure,
        "neighbor_avg": neighbor_avg,
    }


# ---------------------------------------------------------------------------
# Dataset builder
# ---------------------------------------------------------------------------

def build_dataset(
    raw_dir: str,
    weights_path: str,
    test_months: int = TEST_MONTHS,
) -> tuple:
    """
    Build complete train/test dataset with freshness simulation.
    Returns (X_train, y_train, X_test, y_test, feature_names).
    """
    print("Loading station data...")
    station_records = load_all_stations(raw_dir)
    weights = load_model_weights(weights_path)

    # Sort all records chronologically
    for sid in station_records:
        station_records[sid].sort(key=lambda r: r["from"])

    # Build cross-station lookup (all data, used for both train and test)
    print("Building timestamp lookup...")
    ts_lookup = build_timestamp_lookup(station_records)

    # Build per-station lag indexes
    lag_indexes = {
        sid: build_lag_index(records)
        for sid, records in station_records.items()
    }

    # Compute cutoff for test set (last N months)
    now = datetime.now(OSLO)
    # Subtract months safely using timedelta approximation (30 days/month)
    cutoff_dt = now - timedelta(days=test_months * 30)
    cutoff_iso = cutoff_dt.isoformat()

    print(f"Test cutoff: {cutoff_iso[:10]}")

    train_rows = []
    train_targets = []
    test_rows = []
    test_targets = []

    rng = random.Random(42)

    for station_id, records in station_records.items():
        n_records = len(records)
        if n_records < MIN_RECORDS_FOR_TRAINING:
            print(f"  Skipping {station_id}: only {n_records} records")
            continue

        print(f"  Processing {station_id}: {n_records} records")

        for rec in records:
            # Quality filters
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

            residual = float(rec["volume"]) - baseline
            is_test = rec["from"] >= cutoff_iso

            if is_test:
                row = build_feature_row(
                    station_id, rec, baseline,
                    station_records, weights, ts_lookup, lag_indexes,
                    freshness=0.0, mask_lags=False, mask_latest=False,
                )
                test_rows.append([row[f] for f in FEATURE_NAMES])
                test_targets.append(residual)
            else:
                # Freshness simulation
                r = rng.random()
                p = FRESHNESS_SIMULATION
                if r < p["fresh_prob"]:
                    freshness = 0.0
                    mask_lags = False
                    mask_latest = False
                elif r < p["fresh_prob"] + p["stale_prob"]:
                    lo, hi = p["stale_range"]
                    freshness = rng.uniform(lo, hi)
                    mask_lags = True
                    mask_latest = False
                else:
                    lo, hi = p["missing_range"]
                    freshness = rng.uniform(lo, hi)
                    mask_lags = True
                    mask_latest = True

                row = build_feature_row(
                    station_id, rec, baseline,
                    station_records, weights, ts_lookup, lag_indexes,
                    freshness=freshness, mask_lags=mask_lags, mask_latest=mask_latest,
                )
                train_rows.append([row[f] for f in FEATURE_NAMES])
                train_targets.append(residual)

    X_train = np.array(train_rows, dtype=np.float32)
    y_train = np.array(train_targets, dtype=np.float32)
    X_test = np.array(test_rows, dtype=np.float32)
    y_test = np.array(test_targets, dtype=np.float32)

    print(f"Dataset built: {len(X_train)} train, {len(X_test)} test samples")
    return X_train, y_train, X_test, y_test, FEATURE_NAMES
