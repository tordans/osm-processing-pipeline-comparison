CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS benchmark;

DROP TABLE IF EXISTS benchmark.playground_polygons_raw;
CREATE TABLE benchmark.playground_polygons_raw AS
SELECT osm_id, osm_type, name, amenity, playground, geom
FROM playground_polygons_way
UNION ALL
SELECT osm_id, osm_type, name, amenity, playground, geom
FROM playground_polygons_relation;

DROP TABLE IF EXISTS benchmark.playground_equipment;
CREATE TABLE benchmark.playground_equipment AS
SELECT osm_id, osm_type, name, amenity, playground, geom
FROM playground_points
WHERE playground IS NOT NULL
UNION ALL
SELECT osm_id, osm_type, name, amenity, playground, geom
FROM playground_lines
WHERE playground IS NOT NULL
UNION ALL
SELECT osm_id, osm_type, name, amenity, playground, geom
FROM benchmark.playground_polygons_raw
WHERE playground IS NOT NULL;

DROP TABLE IF EXISTS benchmark.playground_polygons_enriched;
CREATE TABLE benchmark.playground_polygons_enriched AS
SELECT
  osm_id,
  osm_type,
  name,
  amenity,
  playground,
  geom,
  0::integer AS play_equipment_count
FROM benchmark.playground_polygons_raw
WHERE amenity = 'playground';

CREATE INDEX IF NOT EXISTS benchmark_playground_polygons_enriched_geom_idx
  ON benchmark.playground_polygons_enriched USING gist(geom);
CREATE INDEX IF NOT EXISTS benchmark_playground_equipment_geom_idx
  ON benchmark.playground_equipment USING gist(geom);

ANALYZE benchmark.playground_polygons_enriched;
ANALYZE benchmark.playground_equipment;

UPDATE benchmark.playground_polygons_enriched p
SET play_equipment_count = sub.cnt
FROM (
  SELECT p2.osm_id, p2.osm_type, COUNT(*)::integer AS cnt
  FROM benchmark.playground_polygons_enriched p2
  JOIN benchmark.playground_equipment e
    ON ST_Intersects(p2.geom, e.geom)
  GROUP BY p2.osm_id, p2.osm_type
) AS sub
WHERE p.osm_id = sub.osm_id
  AND p.osm_type = sub.osm_type;

DROP TABLE IF EXISTS benchmark.playground_export;
CREATE TABLE benchmark.playground_export AS
SELECT
  osm_id,
  osm_type,
  name,
  amenity,
  playground,
  NULL::integer AS play_equipment_count,
  geom
FROM playground_points
UNION ALL
SELECT
  osm_id,
  osm_type,
  name,
  amenity,
  playground,
  NULL::integer AS play_equipment_count,
  geom
FROM playground_lines
UNION ALL
SELECT
  osm_id,
  osm_type,
  name,
  amenity,
  playground,
  play_equipment_count,
  geom
FROM benchmark.playground_polygons_enriched;

CREATE INDEX IF NOT EXISTS benchmark_playground_export_geom_idx
  ON benchmark.playground_export USING gist(geom);

ANALYZE benchmark.playground_export;
