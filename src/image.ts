import type { HomeAssistant } from "./types";

/** Only the configured HA origin may serve an image. No third-party fetches/uploads. */
export function localImageUrl(
  source: string,
  origin = window.location.origin,
): string {
  if (!source.trim())
    throw new Error("Bitte eine Home-Assistant-Bildquelle angeben.");
  const url = new URL(source, origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== origin ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Bitte eine Bildquelle derselben Home-Assistant-Instanz verwenden.",
    );
  }
  return url.href;
}
export async function resolveImage(
  hass: HomeAssistant | undefined,
  source: string,
  origin?: string,
): Promise<string> {
  if (source.startsWith("media-source://")) {
    if (!hass?.callWS) throw new Error("HA-Media ist noch nicht verfügbar.");
    const media = await hass.callWS<{ url: string }>({
      type: "media_source/resolve_media",
      media_content_id: source,
    });
    return localImageUrl(media.url, origin);
  }
  return localImageUrl(source, origin);
}
