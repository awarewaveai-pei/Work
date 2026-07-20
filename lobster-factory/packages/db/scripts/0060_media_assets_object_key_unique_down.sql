-- 0060 rollback: remove the single-column unique index on object_key
drop index if exists uq_media_assets_object_key;
