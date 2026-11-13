// Canadian holidays, computed for any year.
// federal    = general holidays under the Canada Labour Code
// quebec     = Quebec statutory holidays that differ from the federal list
// provincial = widely observed days that are statutory only in some provinces
import { pad } from './core.js';

const d = (y, m, day) => `${y}-${pad(m)}-${pad(day)}`;

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const shift = (date, days) => { const n = new Date(date); n.setDate(n.getDate() + days); return n; };
const iso = (date) => d(date.getFullYear(), date.getMonth() + 1, date.getDate());
// nth weekday (0=Sun) of a month
function nth(y, m, weekday, n) {
  const first = new Date(y, m - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return d(y, m, 1 + offset + (n - 1) * 7);
}
// Monday on or before May 24
function victoria(y) {
  const may24 = new Date(y, 4, 24);
  return iso(shift(may24, -((may24.getDay() + 6) % 7)));
}

export function holidays(year, regions = { federal: true }) {
  const e = easter(year);
  const list = [
    { date: d(year, 1, 1), name: "New Year's Day", fr: 'Jour de l’An', scope: 'federal' },
    { date: nth(year, 2, 1, 3), name: 'Family Day', fr: 'Jour de la famille', scope: 'provincial', note: 'BC, AB, SK, ON, NB (other names in MB, NS, PEI)' },
    { date: iso(shift(e, -2)), name: 'Good Friday', fr: 'Vendredi saint', scope: 'federal' },
    { date: iso(shift(e, 1)), name: 'Easter Monday', fr: 'Lundi de Pâques', scope: 'quebec', note: 'Quebec (employer option) and federal public service' },
    { date: victoria(year), name: 'Victoria Day', fr: 'Fête de la Reine', scope: 'federal', note: 'Journée nationale des patriotes in Quebec' },
    { date: d(year, 6, 24), name: 'Fête nationale du Québec', fr: 'Fête nationale du Québec', scope: 'quebec', note: 'Saint-Jean-Baptiste Day' },
    { date: d(year, 7, 1), name: 'Canada Day', fr: 'Fête du Canada', scope: 'federal', note: new Date(year, 6, 1).getDay() === 0 ? 'Legal holiday observed Monday, July 2' : '' },
    { date: nth(year, 8, 1, 1), name: 'Civic Holiday', fr: 'Congé civique', scope: 'provincial', note: 'Observed in most provinces, not QC' },
    { date: nth(year, 9, 1, 1), name: 'Labour Day', fr: 'Fête du Travail', scope: 'federal' },
    { date: d(year, 9, 30), name: 'National Day for Truth and Reconciliation', fr: 'Journée nationale de la vérité et de la réconciliation', scope: 'federal', solemn: true },
    { date: nth(year, 10, 1, 2), name: 'Thanksgiving', fr: 'Action de grâce', scope: 'federal' },
    { date: d(year, 11, 11), name: 'Remembrance Day', fr: 'Jour du Souvenir', scope: 'federal', solemn: true },
    { date: d(year, 12, 25), name: 'Christmas Day', fr: 'Noël', scope: 'federal' },
    { date: d(year, 12, 26), name: 'Boxing Day', fr: 'Lendemain de Noël', scope: 'federal' },
  ];
  return list.filter((h) => regions[h.scope]);
}

export function holidayMap(years, regions) {
  const map = {};
  years.forEach((y) => holidays(y, regions).forEach((h) => { (map[h.date] = map[h.date] || []).push(h); }));
  return map;
}

export function upcomingHolidays(regions, count = 5, from = new Date()) {
  const today = iso(from);
  const y = from.getFullYear();
  return [...holidays(y, regions), ...holidays(y + 1, regions)].filter((h) => h.date >= today).slice(0, count);
}
