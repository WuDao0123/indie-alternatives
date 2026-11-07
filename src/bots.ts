/**
 * Tells crawlers and scripts apart from people, so landing page counters measure people.
 * Only the User-Agent header is read, nothing is stored.
 */
const KNOWN =
  /(googlebot|google-inspectiontool|googleother|adsbot-google|bingbot|bingpreview|applebot|duckduckbot|yandex\w*|baiduspider|bytespider|petalbot|sogou|seznambot|ahrefsbot|semrushbot|mj12bot|dotbot|dataforseobot|blexbot|serpstatbot|barkrowler|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|claude-user|anthropic-ai|perplexitybot|perplexity-user|ccbot|amazonbot|meta-externalagent|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|imagesiftbot|diffbot|timpibot|youbot|mistralai-user|cohere-ai|ai2bot|omgili|iaskspider)/i;
const GENERIC = /bot\b|bot\/|crawl|spider|slurp|scrap|fetch|preview|monitor|uptime|headless|lighthouse|pagespeed|curl\/|wget|python|httpx|aiohttp|go-http|java\/|okhttp|node-fetch|undici|axios|libwww|http_request|ruby|php\/|postman|insomnia/i;

/** undefined for a person's browser, otherwise a short label such as "googlebot" or "other" */
export function botName(ua: string | null): string | undefined {
  if (!ua || ua.length < 20) return "other";
  const k = ua.match(KNOWN);
  if (k) return k[1].toLowerCase();
  if (GENERIC.test(ua)) return "other";
  // real browsers all send "Mozilla/5.0 (...)"
  if (!/^Mozilla\/5\.0 \(/.test(ua)) return "other";
  return undefined;
}
