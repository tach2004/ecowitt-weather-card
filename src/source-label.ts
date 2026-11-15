import type { CardConfig, DeviceRole, HomeAssistant } from "./types";
import {
  DEVICE_ROLES,
  roleForDevice,
  type RegistryDevice,
  type RegistryEntity,
} from "./suggestions";

export interface SourceRegistry {
  devices?: RegistryDevice[];
  entities?: RegistryEntity[];
}
// Additive for compatibility with cards created before saved role selection existed.
export type SourceLabelConfig = CardConfig & {
  device_roles?: Partial<Record<DeviceRole, string>>;
};

const roleToken = /\b(?:WS90|WH90|WH40|WN32|WH32|WN31|WH31|GW3000[A-Z]?)\b/gi;
const technicalId = /\b(?:sensor|binary_sensor)\.[a-z0-9_]+\b/gi;

function readable(value: unknown, entityId: string): string {
  if (typeof value !== "string") return "";
  return value
    .split(entityId)
    .join("")
    .replace(technicalId, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s·•,;:()/–—-]+|[\s·•,;:()/–—-]+$/g, "")
    .trim();
}

/** Metric labels describe their slot, so source-role hints in them are not evidence. */
function metricName(value: string | undefined, entityId: string): string {
  if (!value) return "";
  return readable(
    value
      .split(/[·•]/)
      .filter((part) => {
        roleToken.lastIndex = 0;
        return !roleToken.test(part);
      })
      .join(" · "),
    entityId,
  );
}

function uniqueRole(
  candidates: (DeviceRole | undefined)[],
): DeviceRole | undefined {
  const roles = [
    ...new Set(
      candidates.filter((role): role is DeviceRole =>
        Boolean(role && DEVICE_ROLES.includes(role)),
      ),
    ),
  ];
  return roles.length === 1 ? roles[0] : undefined;
}

function confirmedRole(
  config: SourceLabelConfig,
  entityId: string,
  registry?: SourceRegistry,
): DeviceRole | undefined {
  const deviceIds = [
    ...new Set(
      (registry?.entities || [])
        .filter((entity) => entity.entity_id === entityId && entity.device_id)
        .map((entity) => entity.device_id!),
    ),
  ];
  if (deviceIds.length > 1) return undefined;
  if (deviceIds.length === 1) {
    const deviceId = deviceIds[0];
    const models = (registry?.devices || []).filter(
      (device) => device.id === deviceId,
    );
    const modelRole = uniqueRole(models.map(roleForDevice));
    if (modelRole) return modelRole;
    // A saved role is meaningful only when the actual entity registry links the
    // selected source to that device. A selected gateway alone proves no source.
    return uniqueRole([
      ...Object.entries(config.device_roles || {})
        .filter(([, id]) => id === deviceId)
        .map(([role]) => role as DeviceRole),
      ...(config.device_status || [])
        .filter((device) => device.device_id === deviceId)
        .map((device) => device.role),
    ]);
  }
  // Explicit source membership is sufficient without a live registry. Never
  // guess a role from an entity ID, metric key, or preferred source in its label.
  return uniqueRole(
    (config.device_status || [])
      .filter((device) =>
        [
          device.battery,
          device.signal,
          device.connection,
          ...(device.extra_entities || []),
        ].includes(entityId),
      )
      .map((device) => device.role),
  );
}

/** Human-readable source text only; entity IDs remain available to More-Info callers. */
export function sourceLabel(
  hass: HomeAssistant | undefined,
  config: SourceLabelConfig,
  entityId: string,
  metricLabel?: string,
  registry?: SourceRegistry,
): string {
  const friendly = readable(
    hass?.states[entityId]?.attributes.friendly_name,
    entityId,
  );
  const metric = metricName(metricLabel, entityId);
  const role = confirmedRole(config, entityId, registry);
  if (!role) return friendly || metric || "Quelle";
  // Avoid repeated or misleading source hints when metadata establishes a role.
  const name =
    readable((friendly || metric).replace(roleToken, ""), entityId) ||
    metric ||
    "Quelle";
  return `${name} · ${role}`;
}
