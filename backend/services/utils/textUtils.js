const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toLower = (value = '') => String(value).toLowerCase();
const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const truncateText = (value = '', maxLen = 300) => {
  const text = String(value || '');
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`;
};

module.exports = {
  clamp,
  toLower,
  toFiniteNumber,
  truncateText,
};
