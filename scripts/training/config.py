"""
All calibration constants, feature names, station lists and hyperparameters.
"""

# --- Station lists ---

MIN_RECORDS_FOR_TRAINING = 1000

FULL_DATA_STATIONS = [
    "40641V971605",  # Kanalbrua
    "15322V971307",  # Storebaug
    "26266V443149",  # E6 Nord
    "28495V971383",  # Patterød vest
    "69994V971384",  # Vogts gate
]

RV19_IDS = [
    "39666V971386",  # Østre Kanalgate
    "72867V971385",  # Rådhusbrua
    "69994V971384",  # Vogts gate
    "76208V971383",  # Mosseelva
]

E6_IDS = [
    "40488V971307",  # Patterød sør
    "15322V971307",  # Storebaug
    "26266V443149",  # E6 Nord
]

CENTRUM_IDS = [
    "69994V971384",  # Vogts gate
    "72867V971385",  # Rådhusbrua
]

# --- Categorical encoding ---

STATION_ENCODING = {
    "40641V971605": 0,  # Kanalbrua
    "15322V971307": 1,  # Storebaug
    "26266V443149": 2,  # E6 Nord
    "28495V971383": 3,  # Patterød vest
    "69994V971384": 4,  # Vogts gate
    "72867V971385": 5,  # Rådhusbrua
    "59044V971518": 6,  # Fjordveien
    "76208V971383": 7,  # Mosseelva
    "39666V971386": 8,  # Østre Kanalgate
    "40488V971307": 9,  # Patterød sør
}

DAY_TYPE_ENCODING = {
    "normal": 0,
    "school_break": 1,
    "pre_holiday": 2,
    "public_holiday": 3,
}

CATEGORICAL_FEATURES = {
    "station_id": STATION_ENCODING,
}

# --- Feature names (order matters for LightGBM) ---

FEATURE_NAMES = [
    "baseline_prediction",
    "station_id",
    "weekday",
    "hour",
    "month",
    "day_type",
    "is_rush",
    "is_evening",
    "latest_measured_volume",
    "freshness",
    "coverage",
    "lag_1h",
    "lag_2h",
    "lag_3h",
    "sum_rv19",
    "sum_e6",
    "centrum_pressure",
    "neighbor_avg",
]

# --- LightGBM hyperparameters ---

LGBM_PARAMS = {
    "objective": "quantile",
    "metric": "quantile",
    "num_leaves": 31,
    "learning_rate": 0.05,
    "min_data_in_leaf": 50,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "verbose": -1,
}

N_ESTIMATORS = 50

QUANTILE_ALPHAS = [0.1, 0.5, 0.9]
QUANTILE_LABELS = ["p10", "p50", "p90"]

# --- Freshness simulation (training augmentation) ---

FRESHNESS_SIMULATION = {
    "fresh_prob": 0.70,       # freshness=0, full lag features
    "stale_prob": 0.20,       # freshness=random(2,4), lags=-1
    "missing_prob": 0.10,     # freshness=random(4,8), lags=-1 + latest=-1
    "stale_range": (2, 4),
    "missing_range": (4, 8),
}

# --- Train/test split ---

TEST_MONTHS = 4

# --- Quality thresholds ---

MIN_COVERAGE = 50
MIN_VOLUME = 10


# ---------------------------------------------------------------------------
# Signal stations (external leading indicators, NOT core stations)
# ---------------------------------------------------------------------------

SIGNAL_STATION_IDS = {
    "48148V1175464": {"name": "Horten RV19 nord", "corridor": "horten_rv19", "lag_minutes": 60},
    "37692V1827282": {"name": "Horten RV19 sor", "corridor": "horten_rv19", "lag_minutes": 45},
    "65271V443150":  {"name": "Vestby syd (E6)", "corridor": "e6_nord", "lag_minutes": 30},
    "12554V971778":  {"name": "Jonsten (E6 sor)", "corridor": "e6_sor", "lag_minutes": 40},
    "65179V1209937": {"name": "Solli (E6 sor)", "corridor": "e6_sor", "lag_minutes": 25},
    "37187V971514":  {"name": "Halmstad sor (Larkollen)", "corridor": "larkollen", "lag_minutes": 20},
}

HORTEN_IDS = ["48148V1175464", "37692V1827282"]
E6_NORD_IDS = ["65271V443150"]
E6_SOR_IDS = ["12554V971778", "65179V1209937"]
LARKOLLEN_IDS = ["37187V971514"]

# Signal feature names (corridor lags)
SIGNAL_FEATURE_NAMES = [
    "horten_lag1h", "horten_lag2h",
    "e6nord_lag1h", "e6nord_lag2h",
    "e6sor_lag1h", "e6sor_lag2h",
    "larkollen_lag1h", "larkollen_lag2h",
]

# Internal lagged sums (core stations, lagged)
INTERNAL_LAG_FEATURE_NAMES = [
    "sum_rv19_lag1h",
    "sum_e6_lag1h",
]

# Momentum feature
MOMENTUM_FEATURE_NAMES = [
    "momentum_1h",
]

# Production feature set (baseline + signals, validated via ablation)
PROD_FEATURE_NAMES = FEATURE_NAMES + SIGNAL_FEATURE_NAMES

# Ablation configurations: name -> feature list
ABLATION_CONFIGS = {
    "baseline": FEATURE_NAMES,
    "+signals": PROD_FEATURE_NAMES,
    "+signals+internal_lags": PROD_FEATURE_NAMES + INTERNAL_LAG_FEATURE_NAMES,
    "+all": PROD_FEATURE_NAMES + INTERNAL_LAG_FEATURE_NAMES + MOMENTUM_FEATURE_NAMES,
}
