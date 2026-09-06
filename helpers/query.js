function pageOptions(filters = {}) {
  const page = Number(filters.page ?? 1);
  const limit = Number(filters.limit ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Invalid pagination: page >= 1 and limit between 1 and 100 required');
  }
  return { page, limit, skip: (page - 1) * limit };
}

// Date-only inputs represent UTC calendar days; timestamps must include an offset.
function parseDate(value, end = false) {
  const raw = String(value);
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  if (!dayOnly && !/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(raw)) throw new Error('Invalid date: UTC day or timestamp with timezone required');
  const date = new Date(dayOnly ? `${raw}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : raw);
  const calendar = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== raw.slice(0, 10)) throw new Error('Invalid date');
  return date;
}

function dateRange(filters) {
  const start = filters.date || filters.startDate;
  const end = filters.date || filters.endDate;
  const range = {};
  if (start) range.$gte = parseDate(start);
  if (end) range.$lte = parseDate(end, true);
  if (range.$gte && range.$lte && range.$gte > range.$lte) throw new Error('Invalid date range');
  return Object.keys(range).length ? range : undefined;
}
module.exports = { pageOptions, parseDate, dateRange };
