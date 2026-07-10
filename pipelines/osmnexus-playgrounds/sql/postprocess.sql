-- Postprocess OSMnexus output into the same benchmark.playground_export shape
-- the osm2pgsql pipelines produce.
--
-- OSMnexus writes (EPSG:3857):
--   playgrounds          tag rows: osm_id, osm_type ('N'|'W'|'R'), osm jsonb (declared fields only)
--   nodes                point geometries for classified/graph nodes (join on osm_id)
--   way_geometries       one LineString per kept way (closed ways are NOT polygonized)
--   relation_geometries  ST_LineMerge of member ways (inner/outer roles are lost)
--
-- This script polygonizes closed rings and enriches leisure=playground polygons
-- with play_equipment_count. Geometries stay in 3857; ogr2ogr reprojects at export.

CREATE SCHEMA IF NOT EXISTS benchmark;

-- Points (osm_type 'N' → 'node')
DROP TABLE IF EXISTS benchmark.playground_points;
CREATE TABLE benchmark.playground_points AS
SELECT
  t.osm_id,
  'node'::text AS osm_type,
  t.osm ->> 'name' AS name,
  t.osm ->> 'leisure' AS leisure,
  t.osm ->> 'playground' AS playground,
  n.geom
FROM playgrounds t
JOIN LATERAL (
  SELECT geom FROM nodes n WHERE n.osm_id = t.osm_id LIMIT 1
) n ON true
WHERE t.osm_type = 'N';

-- Ways: polygonize closed rings, keep open ways as lines
DROP TABLE IF EXISTS benchmark.playground_way_geoms;
CREATE TABLE benchmark.playground_way_geoms AS
SELECT
  t.osm_id,
  'way'::text AS osm_type,
  t.osm ->> 'name' AS name,
  t.osm ->> 'leisure' AS leisure,
  t.osm ->> 'playground' AS playground,
  CASE
    WHEN ST_IsClosed(w.geom) AND ST_NPoints(w.geom) >= 4
      THEN ST_MakePolygon(w.geom)
    ELSE w.geom
  END AS geom
FROM playgrounds t
JOIN way_geometries w ON w.osm_id = t.osm_id
WHERE t.osm_type = 'W';

-- Relations: rebuild areas from merged member linework.
-- Inner/outer roles were dropped by OSMnexus, so ST_BuildArea infers holes
-- from ring nesting; unclosed linework stays a line feature.
DROP TABLE IF EXISTS benchmark.playground_relation_geoms;
CREATE TABLE benchmark.playground_relation_geoms AS
SELECT
  osm_id,
  osm_type,
  name,
  leisure,
  playground,
  CASE
    WHEN built IS NOT NULL AND NOT ST_IsEmpty(built) THEN built
    ELSE raw_geom
  END AS geom
FROM (
  SELECT
    t.osm_id,
    'relation'::text AS osm_type,
    t.osm ->> 'name' AS name,
    t.osm ->> 'leisure' AS leisure,
    t.osm ->> 'playground' AS playground,
    r.geom AS raw_geom,
    ST_BuildArea(ST_Node(r.geom)) AS built
  FROM playgrounds t
  JOIN relation_geometries r ON r.osm_id = t.osm_id
  WHERE t.osm_type = 'R'
) sub;

-- Same enrichment shape as the osm2pgsql pipelines
DROP TABLE IF EXISTS benchmark.playground_polygons_raw;
CREATE TABLE benchmark.playground_polygons_raw AS
SELECT osm_id, osm_type, name, leisure, playground, geom
FROM benchmark.playground_way_geoms
WHERE ST_Dimension(geom) = 2
UNION ALL
SELECT osm_id, osm_type, name, leisure, playground, geom
FROM benchmark.playground_relation_geoms
WHERE ST_Dimension(geom) = 2;

DROP TABLE IF EXISTS benchmark.playground_lines;
CREATE TABLE benchmark.playground_lines AS
SELECT osm_id, osm_type, name, leisure, playground, geom
FROM benchmark.playground_way_geoms
WHERE ST_Dimension(geom) < 2
UNION ALL
SELECT osm_id, osm_type, name, leisure, playground, geom
FROM benchmark.playground_relation_geoms
WHERE ST_Dimension(geom) < 2;

DROP TABLE IF EXISTS benchmark.playground_equipment;
CREATE TABLE benchmark.playground_equipment AS
SELECT osm_id, osm_type, name, leisure, playground, geom
FROM benchmark.playground_points
WHERE playground IS NOT NULL
UNION ALL
SELECT osm_id, osm_type, name, leisure, playground, geom
FROM benchmark.playground_lines
WHERE playground IS NOT NULL
UNION ALL
SELECT osm_id, osm_type, name, leisure, playground, geom
FROM benchmark.playground_polygons_raw
WHERE playground IS NOT NULL;

DROP TABLE IF EXISTS benchmark.playground_polygons_enriched;
CREATE TABLE benchmark.playground_polygons_enriched AS
SELECT
  osm_id,
  osm_type,
  name,
  leisure,
  playground,
  geom,
  0::integer AS play_equipment_count
FROM benchmark.playground_polygons_raw
WHERE leisure = 'playground';

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
  leisure,
  playground,
  NULL::integer AS play_equipment_count,
  geom
FROM benchmark.playground_points
UNION ALL
SELECT
  osm_id,
  osm_type,
  name,
  leisure,
  playground,
  NULL::integer AS play_equipment_count,
  geom
FROM benchmark.playground_lines
UNION ALL
SELECT
  osm_id,
  osm_type,
  name,
  leisure,
  playground,
  NULL::integer AS play_equipment_count,
  geom
FROM benchmark.playground_polygons_raw
WHERE leisure IS DISTINCT FROM 'playground'
UNION ALL
SELECT
  osm_id,
  osm_type,
  name,
  leisure,
  playground,
  play_equipment_count,
  geom
FROM benchmark.playground_polygons_enriched;

CREATE INDEX IF NOT EXISTS benchmark_playground_export_geom_idx
  ON benchmark.playground_export USING gist(geom);

ANALYZE benchmark.playground_export;
