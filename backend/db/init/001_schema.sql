-- Hydrant Halo schema (TimescaleDB / Tiger Data)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------- Hydrants ----------
CREATE TABLE IF NOT EXISTS hydrants (
    id                  TEXT PRIMARY KEY,                 -- e.g. HYD-001
    name                TEXT NOT NULL,
    address             TEXT,
    lat                 DOUBLE PRECISION NOT NULL,        -- fixed at registration (no Wi-Fi geolocation)
    lng                 DOUBLE PRECISION NOT NULL,
    block_threshold_cm  REAL NOT NULL DEFAULT 40,
    clear_threshold_cm  REAL NOT NULL DEFAULT 60,         -- hysteresis gap
    confirm_seconds     INTEGER NOT NULL DEFAULT 10,
    is_simulated        BOOLEAN NOT NULL DEFAULT FALSE,
    qr_token            TEXT NOT NULL UNIQUE,
    state               TEXT NOT NULL DEFAULT 'OFFLINE'
                        CHECK (state IN ('CLEAR','POSSIBLY_BLOCKED','BLOCKED','OFFLINE')),
    state_since         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Sensor readings (hypertable) ----------
CREATE TABLE IF NOT EXISTS sensor_readings (
    time         TIMESTAMPTZ NOT NULL,
    hydrant_id   TEXT NOT NULL REFERENCES hydrants(id),
    seq          BIGINT,
    distance_cm  REAL,
    temp_c       REAL,
    rssi         SMALLINT,
    local_alarm  BOOLEAN,
    source       TEXT NOT NULL CHECK (source IN ('device','simulated'))
);
SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS side_distance_cm REAL;
ALTER TABLE sensor_readings ADD COLUMN IF NOT EXISTS snow_distance_cm REAL;
CREATE INDEX IF NOT EXISTS idx_readings_hydrant_time ON sensor_readings (hydrant_id, time DESC);

ALTER TABLE sensor_readings SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'hydrant_id'
);
SELECT add_compression_policy('sensor_readings', INTERVAL '7 days', if_not_exists => TRUE);

-- ---------- State transitions (hypertable) ----------
CREATE TABLE IF NOT EXISTS hydrant_state_changes (
    time        TIMESTAMPTZ NOT NULL,
    hydrant_id  TEXT NOT NULL REFERENCES hydrants(id),
    from_state  TEXT NOT NULL,
    to_state    TEXT NOT NULL,
    reason      TEXT
);
SELECT create_hypertable('hydrant_state_changes', 'time', if_not_exists => TRUE);

-- ---------- Incidents ----------
CREATE TABLE IF NOT EXISTS incidents (
    id                 BIGSERIAL PRIMARY KEY,
    hydrant_id         TEXT NOT NULL REFERENCES hydrants(id),
    status             TEXT NOT NULL DEFAULT 'OPEN'
                       CHECK (status IN ('OPEN','CLAIMED','SENSOR_CLEARED','PENDING_REVIEW','RESOLVED','DISMISSED')),
    severity           TEXT NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('LOW','MEDIUM','HIGH')),
    obstruction_type   TEXT,
    opened_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    sensor_cleared_at  TIMESTAMPTZ,
    resolved_at        TIMESTAMPTZ,
    ai_summary         TEXT,
    is_simulated       BOOLEAN NOT NULL DEFAULT FALSE
);
-- Only one unresolved incident per hydrant (dedupe)
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_incident_per_hydrant
    ON incidents (hydrant_id) WHERE status NOT IN ('RESOLVED','DISMISSED');

-- ---------- Volunteer claims ----------
CREATE TABLE IF NOT EXISTS volunteer_claims (
    id                BIGSERIAL PRIMARY KEY,
    incident_id       BIGINT NOT NULL REFERENCES incidents(id),
    volunteer_name    TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'CLAIMED'
                      CHECK (status IN ('CLAIMED','SUBMITTED','VERIFYING','READY_FOR_REVIEW','APPROVED','REJECTED')),
    before_photo_url  TEXT,
    after_photo_url   TEXT,
    qr_verified       BOOLEAN NOT NULL DEFAULT FALSE,
    gemini_result     JSONB,
    opencv_result     JSONB,
    sensor_check      JSONB,
    recommendation    TEXT CHECK (recommendation IN ('APPROVE','REVIEW','REJECT')),
    reviewer_note     TEXT,
    claimed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at      TIMESTAMPTZ,
    reviewed_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_claim_per_incident
    ON volunteer_claims (incident_id) WHERE status NOT IN ('REJECTED');

-- ---------- Continuous aggregates ----------
CREATE MATERIALIZED VIEW IF NOT EXISTS readings_1m
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', time) AS bucket,
       hydrant_id,
       min(distance_cm) AS min_distance_cm,
       avg(distance_cm) AS avg_distance_cm,
       avg(temp_c)      AS avg_temp_c,
       count(*)         AS n
FROM sensor_readings
GROUP BY bucket, hydrant_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('readings_1m',
    start_offset => INTERVAL '1 hour',
    end_offset   => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE);

-- Obstructions per hydrant per day (from state-change hypertable)
CREATE MATERIALIZED VIEW IF NOT EXISTS obstructions_daily
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', time) AS day,
       hydrant_id,
       count(*) AS blocked_events
FROM hydrant_state_changes
WHERE to_state = 'BLOCKED'
GROUP BY day, hydrant_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('obstructions_daily',
    start_offset => INTERVAL '30 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists => TRUE);

-- ---------- Risk ranking ----------
CREATE OR REPLACE VIEW hydrant_risk AS
WITH stats AS (
    SELECT h.id AS hydrant_id,
           count(i.id) FILTER (WHERE i.opened_at > now() - INTERVAL '30 days') AS incidents_30d,
           avg(EXTRACT(EPOCH FROM (coalesce(i.sensor_cleared_at, i.resolved_at) - i.opened_at)))
               FILTER (WHERE coalesce(i.sensor_cleared_at, i.resolved_at) IS NOT NULL) AS avg_clear_s,
           max(i.opened_at) AS last_incident_at
    FROM hydrants h
    LEFT JOIN incidents i ON i.hydrant_id = h.id
    GROUP BY h.id
)
SELECT hydrant_id,
       incidents_30d,
       avg_clear_s,
       last_incident_at,
       round((
           incidents_30d * 10
         + coalesce(avg_clear_s, 0) / 3600.0 * 5
         + CASE WHEN last_incident_at > now() - INTERVAL '7 days' THEN 15 ELSE 0 END
       )::numeric, 1) AS risk_score
FROM stats
ORDER BY risk_score DESC;
