-- BENCHMARK ADAPTATION (see README): return empty CSV lookup (no sidepath estimation CSV).

local function load_csv_sidepath(_csv_path)
  return {
    get = function()
      return {}
    end,
  }
end

return load_csv_sidepath
