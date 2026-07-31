-- 0007_embedding_dim_1024.sql
-- Embedding model upgraded bge-base-en-v1.5 (768-dim) -> mxbai-embed-large-v1 (1024-dim); it won
-- the tag-retrieval eval decisively (scripts/eval-embedder.ts). Bump every pgvector column to 1024.
--
-- `using null` CLEARS the existing 768-dim vectors — they live in a different space and can't be
-- compared to 1024-dim ones. The reference vectors (tag/archetype) are regenerated from the seeds,
-- and any stored STUDENT personality_vector is dropped: signed-in students simply re-derive it next
-- time they finish onboarding (fine pre-launch). Same pattern as 0005's 384->768 bump.

alter table interest_tags          alter column embedding type vector(1024) using null;
alter table listings               alter column embedding type vector(1024) using null;
alter table personality_archetypes alter column embedding type vector(1024) using null;
alter table profiles               alter column personality_vector type vector(1024) using null;
alter table custom_tag_requests    alter column embedding type vector(1024) using null;
