// HOSE sessions in Asia/Ho_Chi_Minh (UTC+7): Mon-Fri 09:00-11:30 and 13:00-15:00.
const SESSIONS = [
  { start: 9 * 60, end: 11 * 60 + 30 },
  { start: 13 * 60, end: 15 * 60 }
];

const PRE_OPEN_START = 8 * 60 + 45;
const LUNCH_START = 11 * 60 + 30;
const LUNCH_END = 13 * 60;

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Which HOSE session are we in? Derived on the client so the header keeps working
 * when the API is unreachable; a real provider would report its own status.
 */
export function getMarketStatus(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const weekday = get('weekday');
  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  const isOpen = !weekend && SESSIONS.some((session) => minutes >= session.start && minutes < session.end);

  let session = 'closed';
  if (isOpen) session = 'open';
  else if (!weekend && minutes >= LUNCH_START && minutes < LUNCH_END) session = 'lunchBreak';
  else if (!weekend && minutes >= PRE_OPEN_START && minutes < 9 * 60) session = 'preOpen';
  else if (weekend) session = 'closed';
  else if (minutes < PRE_OPEN_START) session = 'preOpen';
  else session = 'afterHours';

  const labelKey = { open: 'market.open', lunchBreak: 'market.lunchBreak', preOpen: 'market.preOpen', afterHours: 'market.afterHours', closed: 'market.closed' }[session];
  const hours = SESSIONS.map((s) => `${hhmm(s.start)}-${hhmm(s.end)}`).join(', ');

  return { isOpen, session, labelKey, timezone: 'GMT+7', hours, localTime: `${hhmm(minutes)}` };
}
