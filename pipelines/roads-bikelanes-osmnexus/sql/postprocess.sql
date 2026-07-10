-- Postprocess OSMnexus roads/bikelanes output: materialize export tables and
-- apply tilda-geo's bikelane geometry offset (2_move_bikelanes.sql semantics).
--
-- OSMnexus writes (EPSG:3857):
--   bikelanes / roads    tag rows: osm_id, osm_type, id, osm/derived/private jsonb
--   way_geometries       whole-way LineString per kept way (--emit-way-geometries)
--
-- ADAPTATION vs tilda-geo: tilda computes the offset in Lua as
--   side_sign * road_width(parent_tags) / 2
-- with road_width = width|est_width of the PARENT road, else per-highway
-- defaults (primary 10, secondary 8, tertiary 6, residential 6, fallback 8).
-- The OSMnexus config cannot do arithmetic, and its rows carry the bikelane's
-- own width plus the derived road class (parent_or_obj) — so the offset is
-- computed here in SQL from _side sign x the same width defaults keyed by
-- derived->>'road'. Parent width tags are not available; defaults apply more
-- often than in tilda production. Offset magnitudes may differ slightly;
-- the step's structure and cost are equivalent.

-- Bikelanes: tag rows joined to whole-way geometry (side-split rows share
-- their parent way's geometry, exactly like tilda before the offset).
DROP TABLE IF EXISTS bikelanes_export;
CREATE TABLE bikelanes_export AS
SELECT
  t.osm_id,
  t.id,
  t.derived ->> 'category' AS category,
  t.osm ->> 'name' AS name,
  t.derived ->> 'oneway' AS oneway,
  COALESCE(t.derived ->> 'surface', t.osm ->> 'surface') AS surface,
  COALESCE(t.derived ->> 'smoothness', t.osm ->> 'smoothness') AS smoothness,
  t.osm ->> 'width' AS width,
  NULLIF(t.private ->> '_side', 'self') AS side,
  t.derived ->> 'road' AS road_class,
  w.geom
FROM bikelanes t
JOIN way_geometries w ON w.osm_id = t.osm_id
WHERE t.osm_type = 'W';

CREATE INDEX bikelanes_export_geom_idx ON bikelanes_export USING gist (geom);

-- Offset sided bikelanes away from the road center line (tilda 2_move_bikelanes.sql):
-- EPSG:5243 for meter units, ST_Simplify(0.5), ST_OffsetCurve(+left/-right),
-- then ST_Reverse to restore per-side line direction.
UPDATE bikelanes_export b
SET geom = ST_Transform(
  ST_OffsetCurve(
    ST_Simplify(ST_Transform(b.geom, 5243), 0.5),
    (CASE b.side WHEN 'left' THEN 1 ELSE -1 END)
      * (
          COALESCE(
            substring(b.width from '^[0-9]+\.?[0-9]*')::numeric,
            CASE b.road_class
              WHEN 'primary' THEN 10
              WHEN 'secondary' THEN 8
              WHEN 'tertiary' THEN 6
              WHEN 'residential' THEN 6
              ELSE 8
            END
          ) / 2.0
        )
  ),
  3857
)
WHERE b.side IN ('left', 'right')
  AND ST_IsSimple(b.geom)
  AND NOT ST_IsClosed(b.geom);

UPDATE bikelanes_export b
SET geom = ST_Reverse(geom)
WHERE b.side IN ('left', 'right')
  AND ST_IsSimple(b.geom)
  AND NOT ST_IsClosed(b.geom);

-- Roads: counts only (validation parity); no offset step.
DROP TABLE IF EXISTS roads_export;
CREATE TABLE roads_export AS
SELECT
  t.osm_id,
  t.id,
  t.derived ->> 'category' AS category,
  w.geom
FROM roads t
JOIN way_geometries w ON w.osm_id = t.osm_id
WHERE t.osm_type = 'W';

ANALYZE bikelanes_export;
ANALYZE roads_export;
