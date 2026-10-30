/**
 * Upgrades a Twitter/X profile image URL from small variants
 * (_normal, _bigger, _mini) to _400x400 (400×400 px) so avatars are sharp on all devices.
 *
 * X API v2 always returns `_normal`; replacing the suffix is officially supported:
 * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/user-profile-images-and-banners
 *
 * If the URL is null/undefined or does not contain a recognizable X CDN
 * pattern, it is returned unchanged so nothing breaks.
 */
export function normalizeXAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith("https://pbs.twimg.com/")) return url;
  return url.replace(/_(normal|bigger|mini)\.(jpg|jpeg|png|gif|webp)$/i, "_400x400.$2");
}
