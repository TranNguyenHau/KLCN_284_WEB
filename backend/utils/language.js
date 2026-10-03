export const SUPPORTED_LANGUAGES = ['vi', 'en'];
export const DEFAULT_LANGUAGE = 'vi';

/**
 * The chat replies in the language the user picked in the UI, not the language they typed.
 * The frontend sends its active code on every request; anything unknown falls back to the
 * project language instead of throwing, so a stale client cannot break the endpoint.
 */
export function normalizeLanguage(value) {
  const code = String(value || '').trim().toLowerCase().slice(0, 2);
  return SUPPORTED_LANGUAGES.includes(code) ? code : DEFAULT_LANGUAGE;
}

export function localeOf(language) {
  return normalizeLanguage(language) === 'vi' ? 'vi-VN' : 'en-US';
}

/**
 * The opening line required by the KLCN-284 brief, per language. The frontend keeps the
 * same two strings in its dictionaries (chat.greeting), because it seeds the line as the
 * first chat bubble before any request is made.
 */
export const GREETING = {
  vi: 'Dữ liệu đã lên sàn! Đưa số liệu thời gian thực đây, tôi sẽ phân tích đường đi của dòng tiền cho bạn ngay lập tức!',
  en: 'Data is on the board! Give me the real-time numbers and I will trace where the money is flowing for you right away!'
};
