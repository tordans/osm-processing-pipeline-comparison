-- BENCHMARK ADAPTATION (see README): return empty pseudo-tag lookup (no CSV inputs).

local function load_merged_pseudo_tags()
  return {
    get = function()
      return {}
    end,
  }
end

return load_merged_pseudo_tags
