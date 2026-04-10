local function is_target(tags)
  return tags.amenity == "playground" or tags.playground ~= nil
end

local points = osm2pgsql.define_table({
  name = "playground_points",
  ids = { type = "node", id_column = "osm_id" },
  columns = {
    { column = "osm_type", type = "text", not_null = true },
    { column = "name", type = "text" },
    { column = "amenity", type = "text" },
    { column = "playground", type = "text" },
    { column = "geom", type = "point", projection = 4326, not_null = true },
  },
})

local lines = osm2pgsql.define_table({
  name = "playground_lines",
  ids = { type = "way", id_column = "osm_id" },
  columns = {
    { column = "osm_type", type = "text", not_null = true },
    { column = "name", type = "text" },
    { column = "amenity", type = "text" },
    { column = "playground", type = "text" },
    { column = "geom", type = "linestring", projection = 4326, not_null = true },
  },
})

local polygons_way = osm2pgsql.define_table({
  name = "playground_polygons_way",
  ids = { type = "way", id_column = "osm_id" },
  columns = {
    { column = "osm_type", type = "text", not_null = true },
    { column = "name", type = "text" },
    { column = "amenity", type = "text" },
    { column = "playground", type = "text" },
    { column = "geom", type = "polygon", projection = 4326, not_null = true },
  },
})

local polygons_relation = osm2pgsql.define_table({
  name = "playground_polygons_relation",
  ids = { type = "relation", id_column = "osm_id" },
  columns = {
    { column = "osm_type", type = "text", not_null = true },
    { column = "name", type = "text" },
    { column = "amenity", type = "text" },
    { column = "playground", type = "text" },
    { column = "geom", type = "multipolygon", projection = 4326, not_null = true },
  },
})

function osm2pgsql.process_node(object)
  if not is_target(object.tags) then
    return
  end

  points:insert({
    osm_type = "node",
    name = object.tags.name,
    amenity = object.tags.amenity,
    playground = object.tags.playground,
    geom = object:as_point(),
  })
end

function osm2pgsql.process_way(object)
  if not is_target(object.tags) then
    return
  end

  local line_geom = object:as_linestring()
  if line_geom then
    lines:insert({
      osm_type = "way",
      name = object.tags.name,
      amenity = object.tags.amenity,
      playground = object.tags.playground,
      geom = line_geom,
    })
  end

  local polygon_geom = object:as_polygon()
  if polygon_geom then
    polygons_way:insert({
      osm_type = "way",
      name = object.tags.name,
      amenity = object.tags.amenity,
      playground = object.tags.playground,
      geom = polygon_geom,
    })
  end
end

function osm2pgsql.process_relation(object)
  if not is_target(object.tags) then
    return
  end

  local mp_geom = object:as_multipolygon()
  if mp_geom then
    polygons_relation:insert({
      osm_type = "relation",
      name = object.tags.name,
      amenity = object.tags.amenity,
      playground = object.tags.playground,
      geom = mp_geom,
    })
  end
end
