# Moss Trafikk v2 Training Pipeline

## Setup

```bash
cd scripts/training
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Train

```bash
python train.py
```

Output: `src/data/residual-model.json`

## Evaluate

```bash
python eval_v2.py
```

## Architecture

- `config.py`: All calibration constants and hyperparameters
- `features.py`: Feature engineering from raw history + model weights
- `train.py`: Main training script (3 quantile models)
- `export_model.py`: Convert LightGBM to compact JSON for TypeScript
- `eval_v2.py`: Extended evaluation metrics
