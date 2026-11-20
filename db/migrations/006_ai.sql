-- Cache for AI-generated review summaries (one per event, regenerated only when its reviews change). Idempotent.
CREATE TABLE IF NOT EXISTS ai_summaries (
    event_id     UUID PRIMARY KEY REFERENCES events(id),
    reviews_hash TEXT        NOT NULL,
    review_count INTEGER     NOT NULL,
    summary      TEXT        NOT NULL,
    model        TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
