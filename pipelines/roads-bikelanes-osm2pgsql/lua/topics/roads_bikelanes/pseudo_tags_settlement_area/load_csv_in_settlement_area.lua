-- BENCHMARK ADAPTATION (see README): return empty settlement-area CSV lookup.

local load_csv_sidepath = require('topics.roads_bikelanes.pseudo_tags_sidepath.load_csv_sidepath')

local function load_csv_in_settlement_area()
  return load_csv_sidepath('/data/pseudoTagsData/settlement_area_estimation.csv')
end

return load_csv_in_settlement_area
