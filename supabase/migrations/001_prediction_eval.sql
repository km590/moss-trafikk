-- Prediction evaluation table for calibration.
-- Snapshots are written hourly, actuals backfilled when Vegvesen data arrives.
create table if not exists prediction_eval (
  id uuid primary key default gen_random_uuid(),
  station_id text not null,
  target_hour timestamptz not null,         -- the hour being predicted (Oslo time, top of hour)
  predicted_volume int not null,
  baseline_volume int not null,             -- prediction without ferry boost
  ferry_boost_factor real not null default 1.0,
  ferry_boost_active boolean not null default false,
  confidence text not null default 'medium', -- high/medium/low
  day_type text not null default 'normal',   -- normal/public_holiday/pre_holiday/school_break

  -- Filled later when actuals arrive
  actual_volume int,
  actual_available_at timestamptz,
  error_abs int generated always as (
    case when actual_volume is not null then abs(actual_volume - predicted_volume) end
  ) stored,
  error_pct real generated always as (
    case when actual_volume is not null and actual_volume > 10
      then round(abs(actual_volume - predicted_volume)::numeric / actual_volume * 100, 1)
    end
  ) stored,
  signed_error_pct real generated always as (
    case when actual_volume is not null and actual_volume > 10
      then round((predicted_volume - actual_volume)::numeric / actual_volume * 100, 1)
    end
  ) stored,

  created_at timestamptz not null default now(),

  -- Prevent duplicate snapshots
  unique(station_id, target_hour)
);

-- Index for admin queries
create index if not exists idx_pred_eval_station_hour
  on prediction_eval (station_id, target_hour desc);

create index if not exists idx_pred_eval_pending
  on prediction_eval (actual_volume) where actual_volume is null;
