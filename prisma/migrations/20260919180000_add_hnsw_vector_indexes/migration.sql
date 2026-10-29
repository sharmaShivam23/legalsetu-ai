-- Approximate-nearest-neighbour indexes for vector search.
--
-- Until now there was no index on either embedding column, so every
-- retrieval in lib/rag/retriever.ts was a sequential scan: Postgres
-- computed cosine distance against EVERY chunk on EVERY question. That
-- is survivable at the current corpus size and gets steadily worse with
-- each Act ingested, which is exactly the kind of regression nobody
-- notices until a demo.
--
-- HNSW rather than IVFFlat: it needs no training pass, so it works on an
-- empty table and on one that grows incrementally (the ingestion scripts
-- add sources one Act at a time). IVFFlat would need rebuilding after
-- each bulk load to keep its lists balanced.
--
-- vector_cosine_ops matches the `<=>` operator the retriever queries
-- with. An index built for a different operator class is simply ignored
-- by the planner, which would leave the sequential scan silently in
-- place — the failure mode this migration exists to remove.
--
-- IF NOT EXISTS keeps this safe to re-run against a database where the
-- index was created by hand.

CREATE INDEX IF NOT EXISTS "LegalSourceChunk_embedding_hnsw_idx"
    ON "LegalSourceChunk"
    USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
    ON "DocumentChunk"
    USING hnsw (embedding vector_cosine_ops);
