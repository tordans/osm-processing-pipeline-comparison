/* sql-formatter-disable */
--
-- Entry point for all SQL based processing.
--
\i '/workspace/pipelines/roads-bikelanes-osm2pgsql/sql/2_move_bikelanes.sql'
\i '/workspace/pipelines/roads-bikelanes-osm2pgsql/sql/3_cleanup_todos_lines.sql'

DO $$ BEGIN RAISE NOTICE 'FINISH topics/roads_bikelanes/roads_bikelanes.sql at %', clock_timestamp() AT TIME ZONE 'Europe/Berlin'; END $$;
