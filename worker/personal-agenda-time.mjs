const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/i;

function validDateTimeParts(year, month, day, hour, minute, second) {
  const values = [year, month, day, hour, minute, second].map(Number);
  if (values.some(value => !Number.isInteger(value))) return false;
  const check = new Date(Date.UTC(values[0], values[1] - 1, values[2], values[3], values[4], values[5]));
  return check.getUTCFullYear() === values[0]
    && check.getUTCMonth() + 1 === values[1]
    && check.getUTCDate() === values[2]
    && check.getUTCHours() === values[3]
    && check.getUTCMinutes() === values[4]
    && check.getUTCSeconds() === values[5];
}

function formatTaipeiMinute(instant) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(instant).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function normalizeTaipeiDateTime(value) {
  const text = String(value ?? '').trim();
  const match = text.match(LOCAL_DATE_TIME_PATTERN);
  if (!match) return '';
  const [, year, month, day, hour, minute, second = '00', zone = ''] = match;
  if (!validDateTimeParts(year, month, day, hour, minute, second)) return '';
  if (!zone) return `${year}-${month}-${day}T${hour}:${minute}`;
  const normalizedZone = zone.toUpperCase() === 'Z'
    ? 'Z'
    : zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const instant = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${normalizedZone}`);
  return Number.isNaN(instant.getTime()) ? '' : formatTaipeiMinute(instant);
}

export function isTaipeiLocalDateTime(value) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)
    && normalizeTaipeiDateTime(text) === text;
}

export function taipeiDateTimeEpoch(value) {
  if (!isTaipeiLocalDateTime(value)) return Number.NaN;
  return new Date(`${value}:00+08:00`).getTime();
}
