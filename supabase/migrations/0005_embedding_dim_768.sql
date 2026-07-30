-- 0005_embedding_dim_768.sql
-- Switch the embedding space from 384-dim (bge-small-en-v1.5) to 768-dim (bge-base-en-v1.5).
-- bge-small was too weak on short/specific queries (e.g. "narwhals" matched no biology/ocean
-- tag at all); bge-base fixes this decisively in testing. Most of these columns are unpopulated
-- ("populated in a later pass"); personality_archetypes.embedding is the one exception (10 rows
-- from scripts/embed-archetypes.ts) and those 384-dim values are stale under the new model
-- regardless, so `using null` clears it — scripts/embed-archetypes.ts + db:import repopulate it.

alter table interest_tags          alter column embedding type vector(768);
alter table listings                alter column embedding type vector(768);
alter table personality_archetypes  alter column embedding type vector(768) using null;
alter table profiles                alter column personality_vector type vector(768);
alter table custom_tag_requests     alter column embedding type vector(768);
