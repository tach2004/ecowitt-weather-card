import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

type DemoWindow = Window &
  typeof globalThis & {
    demoReady: boolean;
    card: any;
    hass: any;
    demoConfig: any;
    editor: any;
    lastEditorConfig: any;
    setDemoConfig: (config: any) => void;
    updateDemo: (key: string, state: string | number, unit?: string) => void;
    historyMode: "data" | "empty" | "error";
    historyRequests: any[];
  };
async function ready(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => (window as DemoWindow).demoReady);
  await page.locator("ecowitt-weather-card").waitFor();
  await page.evaluate(async () => {
    await (window as DemoWindow).card.updateComplete;
  });
}
async function update(
  page: Page,
  key: string,
  value: string | number,
  unit?: string,
) {
  await page.evaluate(
    async ({ key, value, unit }) => {
      const win = window as DemoWindow;
      win.updateDemo(key, value, unit);
      await win.card.updateComplete;
    },
    { key, value, unit },
  );
}
async function noOverflow(page: Page) {
  const bounds = await page.evaluate(() => {
    const card = (window as DemoWindow).card;
    const elements = [card, ...card.shadowRoot.querySelectorAll("*")].filter(
      (node: Element) => {
        const style = getComputedStyle(node);
        return style.display !== "none" && style.position !== "fixed";
      },
    );
    const root = card.getBoundingClientRect();
    return {
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
      card: root.width,
      overflow: elements
        .filter((node: Element) => {
          const box = node.getBoundingClientRect();
          if (getComputedStyle(node).visibility === "hidden") return false;
          // Decorative animation tracks may extend outside their clipping layer.
          // Compare the painted horizontal extent rather than their un-clipped box.
          let left = box.left,
            right = box.right;
          for (
            let parent = node.parentElement;
            parent && parent !== card;
            parent = parent.parentElement
          ) {
            if (
              ["hidden", "clip", "auto", "scroll"].includes(
                getComputedStyle(parent).overflowX,
              )
            ) {
              const clip = parent.getBoundingClientRect();
              left = Math.max(left, clip.left);
              right = Math.min(right, clip.right);
            }
          }
          return (
            right > left && (right > root.right + 2 || left < root.left - 2)
          );
        })
        .map(
          (node: Element) => node.tagName + "." + node.getAttribute("class"),
        ),
    };
  });
  expect(bounds.page).toBeLessThanOrEqual(bounds.viewport + 1);
  expect(bounds.overflow).toEqual([]);
}

for (const view of ["panel", "sections"]) {
  for (const width of [320, 375, 390, 402, 430, 600, 768, 1024, 1440]) {
    test(`${view}: ${width}px card stays readable and within its container`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width < 600 ? 874 : 1050 });
      await ready(page, `/?view=${view}`);
      await expect(
        page.locator('[data-key="wind_speed"]').first(),
      ).toContainText("8");
      await expect(
        page.locator('[data-key="rain_today"]').first(),
      ).toContainText("3,2");
      await noOverflow(page);
      const columns = await page
        .locator(".main-layout")
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        );
      const cardWidth = await page
        .locator("ecowitt-weather-card")
        .evaluate((el) => el.getBoundingClientRect().width);
      expect(columns).toBe(cardWidth < 760 ? 1 : 2);
      const targets = await page
        .locator("ecowitt-weather-card")
        .evaluate((card) =>
          Array.from(card.shadowRoot!.querySelectorAll("button"))
            .filter((b) => b.getBoundingClientRect().width > 0)
            .map((b) => ({
              width: b.getBoundingClientRect().width,
              height: b.getBoundingClientRect().height,
            })),
        );
      expect(
        targets.every((target) => target.width >= 43 && target.height >= 43),
      ).toBeTruthy();
    });
  }
}

test("container width controls layout at a fixed desktop viewport", async ({
  page,
}) => {
  await ready(page);
  const layout = page.locator(".main-layout");
  await expect(layout).toHaveCSS("display", "grid");
  const before = await layout.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
  );
  await page.locator("main").evaluate((el) => {
    el.style.width = "390px";
  });
  await expect
    .poll(() =>
      layout.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    )
    .toBe(1);
  expect(before).toBe(2);
  await noOverflow(page);
});

test("wind arrows point toward target from the meteorological source with a short north crossing", async ({
  page,
}) => {
  await ready(page);
  const arrow = page.locator(".flow-current");
  let beforeNorth = 0;
  for (const bearing of [0, 90, 180, 270, 292, 359, 0]) {
    await update(page, "wind_direction", bearing);
    await expect(arrow).toHaveAttribute("data-bearing", String(bearing));
    await expect(arrow).toHaveAttribute(
      "data-flow-bearing",
      String((bearing + 180) % 360),
    );
    await expect(
      page.locator('[data-key="wind_direction"]').first(),
    ).toContainText(`${bearing}`);
    if (bearing === 359)
      beforeNorth = Number(
        (await arrow.getAttribute("style"))?.match(
          /rotate\(\s*([-\d.]+)deg/,
        )?.[1],
      );
  }
  const afterNorth = Number(
    (await arrow.getAttribute("style"))?.match(/rotate\(\s*([-\d.]+)deg/)?.[1],
  );
  expect(afterNorth - beforeNorth).toBeCloseTo(1);
  await update(page, "wind_direction", "unavailable");
  await expect(arrow).toHaveCount(0);
});

test("a valid average wind direction remains visible during a calm while current airflow disappears", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await ready(page);
  const average = page.locator(".wind-layer .flow-average");
  const current = page.locator(".wind-layer .flow-current");

  await update(page, "wind_direction", 85);
  await update(page, "wind_direction_avg", 270);
  await expect(average).toHaveAttribute("data-bearing", "270");
  await expect(current).toHaveAttribute("data-bearing", "85");

  // An instant of 0 km/h does not invalidate the independently reported
  // average (e.g. GW3000 ten-minute mean). No new direction is calculated.
  await update(page, "wind_speed", 0);
  await expect(current).toHaveCount(0);
  await expect(average).toHaveCount(1);
  await expect(average).toHaveAttribute("data-bearing", "270");
  await expect(page.locator(".image-note")).toContainText("Flaute");

  // A legitimate 0° mean is north and must not be mistaken for missing.
  await update(page, "wind_direction_avg", 0);
  await expect(average).toHaveAttribute("data-bearing", "0");

  // Never retain a graphic from a missing or invalid mean reading.
  await update(page, "wind_direction_avg", "unavailable");
  await expect(average).toHaveCount(0);
  await update(page, "wind_direction_avg", 185, "°");
  await expect(average).toHaveAttribute("data-bearing", "185");
  await update(page, "wind_direction_avg", 185, "km/h");
  await expect(average).toHaveCount(0);

  // Current airflow returns only when the wind starts moving again.
  await update(page, "wind_speed", 5);
  await expect(current).toHaveAttribute("data-bearing", "85");
  await expect(average).toHaveCount(0);
  await update(page, "wind_direction_avg", 185, "°");
  await expect(average).toHaveAttribute("data-bearing", "185");
  await noOverflow(page);
});

test("WS90 wet state is separate from WH40 accumulated rain", async ({
  page,
}) => {
  await ready(page);
  await update(page, "rain_wet", "off");
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "TROCKEN",
  );
  await expect(page.locator('[data-key="rain_today"]').first()).toContainText(
    "3,2",
  );
  await update(page, "rain_wet", "on");
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "NASS",
  );
  await update(page, "rain_wet", "unavailable");
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "UNAVAILABLE",
  );
});

test("missing entities show setup and never invented measurements", async ({
  page,
}) => {
  await ready(page, "/?setup=1");
  await expect(page.locator(".setup")).toContainText("visuellen Karteneditor");
  await expect(page.locator('[data-key="wind_speed"]')).toHaveCount(0);
  await expect(page.locator('[data-key="temperature"]')).toHaveCount(0);
});

test("source units are preserved and incompatible units are rejected", async ({
  page,
}) => {
  await ready(page);
  await update(page, "wind_speed", 5.5, "m/s");
  await expect(page.locator('[data-key="wind_speed"]').first()).toContainText(
    "5,5",
  );
  await expect(page.locator('[data-key="wind_speed"]').first()).toContainText(
    "m/s",
  );
  await update(page, "temperature", 65.5, "°F");
  await expect(page.locator('[data-key="temperature"]').first()).toContainText(
    "65,5",
  );
  await expect(page.locator('[data-key="temperature"]').first()).toContainText(
    "°F",
  );
  await update(page, "rain_today", 12, "km/h");
  await expect(
    page.locator('[data-key="rain_today"]').first(),
  ).not.toContainText("12");
});

test("stale sources are clearly labeled", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    const id = win.demoConfig.entities.wind_speed;
    win.hass.states[id] = {
      ...win.hass.states[id],
      last_updated: new Date(Date.now() - 3600000).toISOString(),
    };
    win.setDemoConfig({ ...win.demoConfig, stale_after_minutes: 5 });
    await win.card.updateComplete;
  });
  await expect(page.locator('[data-key="wind_speed"]').first()).toContainText(
    /veraltet|alt/i,
  );
});

test("record date selector initially displays today, not a seven-day range", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Wetterrekorde öffnen" }).click();
  const selector = page.getByRole("dialog").locator("ecowitt-record-date-selector");
  await expect(selector).toBeVisible();
  const dates = await selector.evaluate((element) => {
    const picker = element as any;
    return { from: picker.startDate, to: picker.endDate, today: picker.today };
  });
  expect(dates.from).toBe(dates.today);
  expect(dates.to).toBe(dates.today);
  await selector.getByRole("button", { name: "Kalender und Zeitraum auswählen" }).click();
  await selector.getByRole("button", { name: "Letzte 7 Tage" }).click();
  await selector.getByRole("button", { name: "Auswählen", exact: true }).click();
  const chosen = await selector.evaluate((element) => {
    const picker = element as any;
    return { from: picker.startDate, to: picker.endDate };
  });
  expect(chosen.from).not.toBe(chosen.to);
});

test("selected per-device extra rain, temperature and other weather sources appear only in matching detail cards", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    const now = new Date().toISOString();
    const extras = [
      ["sensor.demo_hourly_precipitation", "Beispiel Stündliche Regenmenge", "2.4", "mm", "precipitation"],
      ["sensor.demo_total_precipitation", "Beispiel Gesamte Regenmenge", "64.2", "mm", "precipitation"],
      ["sensor.demo_room_temp", "Beispiel Temperatur", "19.6", "°C", "temperature"],
      ["sensor.demo_extra_wind", "Beispiel Windböe", "26", "km/h", "wind_speed"],
      ["sensor.demo_extra_pressure", "Beispiel Luftdruck", "1010", "hPa", "atmospheric_pressure"],
      ["sensor.demo_extra_sun", "Beispiel Solarstrahlung", "355", "W/m²", "irradiance"],
      ["sensor.demo_extra_battery", "Beispiel Batterie", "92", "%", "battery"],
      ["sensor.demo_unknown_channel", "Beispiel Messkanal", "80", "%", ""],
      ["sensor.demo_unselected_precipitation", "Nicht zugeordnete Regenmenge", "500", "mm", "precipitation"],
    ] as const;
    for (const [id, friendlyName, value, unit, deviceClass] of extras) {
      win.hass.states[id] = {
        entity_id: id, state: value,
        last_changed: now, last_updated: now,
        attributes: {
          friendly_name: friendlyName,
          unit_of_measurement: unit,
          ...(deviceClass ? { device_class: deviceClass } : {}),
        },
      };
    }
    win.setDemoConfig({
      ...win.demoConfig,
      device_status: [
        {
          device_id: "demo-rain", role: "WH40", name: "Beispiel Regenmesser",
          extra_entities: [
            "sensor.demo_hourly_precipitation",
            "sensor.demo_total_precipitation",
            "sensor.demo_extra_battery",
            "sensor.demo_unknown_channel",
          ],
        },
        {
          device_id: "demo-climate", role: "WN31", name: "Beispiel Klimasensor",
          extra_entities: [
            "sensor.demo_room_temp", "sensor.demo_extra_wind",
            "sensor.demo_extra_pressure", "sensor.demo_extra_sun",
          ],
        },
      ],
      extra_entities: ["sensor.demo_room_temp"],
    });
    await win.card.updateComplete;
  });
  const testCases = [
    { detail: "rain", ids: ["sensor.demo_hourly_precipitation", "sensor.demo_total_precipitation"] },
    { detail: "temperature", ids: ["sensor.demo_room_temp"] },
    { detail: "wind", ids: ["sensor.demo_extra_wind"] },
    { detail: "pressure", ids: ["sensor.demo_extra_pressure"] },
    { detail: "sun", ids: ["sensor.demo_extra_sun"] },
  ] as const;
  for (const item of testCases) {
    await page.locator(`[data-detail="${item.detail}"]:visible`).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".weather-extra-readings")).toBeVisible();
    const rows = dialog.locator(".weather-extra-readings .sensor-row");
    await expect(rows).toHaveCount(item.ids.length);
    for (const id of item.ids) {
      const tile = dialog.locator(`.weather-extra-readings .sensor-row[data-entity-id="${id}"]`);
      await expect(tile).toHaveCount(1);
      await expect(tile.getByRole("button", { name: "Sensor in HA öffnen" })).toBeVisible();
    }
    await expect(dialog.locator(".weather-extra-readings .sensor-row[data-entity-id='sensor.demo_extra_battery']")).toHaveCount(0);
    await expect(dialog.locator(".weather-extra-readings .sensor-row[data-entity-id='sensor.demo_unknown_channel']")).toHaveCount(0);
    await expect(dialog.locator(".weather-extra-readings .sensor-row[data-entity-id='sensor.demo_unselected_precipitation']")).toHaveCount(0);
    await expect(dialog.locator(".history-heading")).toBeVisible();
    await dialog.locator(".close").click();
  }
  await page.locator('[data-detail="sensors"]:visible').first().click();
  const diagnostic = page.getByRole("dialog");
  await expect(diagnostic.locator(".weather-extra-readings")).toHaveCount(0);
  await expect(diagnostic.locator('.sensor-row[data-entity-id="sensor.demo_hourly_precipitation"]')).toHaveCount(1);
  await expect(diagnostic.locator('.sensor-row[data-entity-id="sensor.demo_total_precipitation"]')).toHaveCount(1);
  await expect(diagnostic.locator('.sensor-row[data-entity-id="sensor.demo_room_temp"]')).toHaveCount(1);
  await expect(diagnostic.locator('.sensor-row[data-entity-id="sensor.demo_extra_battery"]')).toHaveCount(1);
});

test("mobile Companion App rain detail keeps fixed overlay when showing a device's extra rain measurements", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 402, height: 874 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Home Assistant/2026.11.0 (iOS) Mobile/HomeAssistant, like Safari",
  });
  try {
    const page = await context.newPage();
    await ready(page);
    await page.evaluate(async () => {
      const win = window as DemoWindow;
      const now = new Date().toISOString();
      win.hass.states["sensor.demo_extra_rain"] = {
        entity_id: "sensor.demo_extra_rain", state: "3.1",
        last_changed: now, last_updated: now,
        attributes: {
          friendly_name: "Beispiel stündliche Regenmenge",
          unit_of_measurement: "mm", device_class: "precipitation",
        },
      };
      win.setDemoConfig({
        ...win.demoConfig,
        device_status: [{
          device_id: "demo-wh40", role: "WH40",
          extra_entities: ["sensor.demo_extra_rain"],
        }],
      });
      await win.card.updateComplete;
    });
    await page.locator('[data-detail="rain"]:visible').first().tap();
    const dialog = page.getByRole("dialog");
    await expect(page.locator(".companion-overlay")).toBeVisible();
    await expect(dialog.locator(".weather-extra-readings .sensor-row")).toHaveCount(1);
    await expect(dialog.locator(".weather-extra-readings .sensor-tile-value")).toContainText("3,1");
    const position = await dialog.evaluate(el => el.getBoundingClientRect().top);
    expect(position).toBeGreaterThanOrEqual(71);
    await dialog.locator(".detail-content").evaluate(el => { el.scrollTop = el.scrollHeight; });
    await dialog.locator(".close").tap();
    await expect(dialog).not.toBeVisible();
  } finally {
    await context.close();
  }
});

test("weather record button opens a separate themed view with local Recorder maxima", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 950 });
  await ready(page);
  const button = page.getByRole("button", { name: "Wetterrekorde öffnen" });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("data-detail", "records");
  const requestsBefore = await page.evaluate(() => (window as DemoWindow).historyRequests.length);
  await button.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Wetterrekorde");
  await expect(dialog.locator("ecowitt-record-date-selector")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Kalender und Zeitraum auswählen" })).toBeVisible();
  await expect(dialog.locator(".record-tile")).toHaveCount(9);
  await expect(dialog.locator(".record-number").first()).not.toHaveText("—");
  await expect(dialog).toContainText("Höchster Tagesregen");
  await expect(dialog).toContainText("UV-Index");
  await expect(dialog).not.toContainText("Luftfeuchte ·");
  await expect(dialog.locator(".records-grid").first()).toBeVisible();
  const req = await page.evaluate((start) => {
    const win = window as DemoWindow;
    return win.historyRequests.slice(start).map(item => item.path);
  }, requestsBefore);
  expect(req.some(path => path.includes("history/period/") &&
    path.includes("filter_entity_id=") && path.includes("demo_rain_today"))).toBe(true);
  await dialog.getByRole("button", { name: "Schließen" }).first().click();
  await expect(dialog).not.toBeVisible();
});

test("clicking a weather-record tile opens its configured HA sensor", async ({ page }) => {
  await ready(page);
  const expected = await page.evaluate(() => (window as DemoWindow).demoConfig.entities.wind_speed);
  await page.evaluate(() => {
    document.addEventListener("hass-more-info", (event) => {
      (window as any).__selectedRecordEntity = (event as CustomEvent).detail.entityId;
    }, { once: true });
  });
  await page.getByRole("button", { name: "Wetterrekorde öffnen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".record-tile")).toHaveCount(9);
  const wind = dialog.locator('[data-record-key="wind_speed"]');
  await expect(wind).toHaveAttribute("type", "button");
  await wind.click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__selectedRecordEntity)).toBe(expected);
  await page.getByRole("button", { name: "Wetterrekorde öffnen" }).click();
  const another = page.getByRole("dialog").locator('[data-record-key="wind_speed"]');
  await another.focus();
  await another.press("Enter");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("record tiles without a configured sensor cannot open unrelated entities", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({
      ...win.demoConfig, entities: { ...win.demoConfig.entities, solar: "" },
    });
    await win.card.updateComplete;
  });
  await page.getByRole("button", { name: "Wetterrekorde öffnen" }).click();
  await expect(page.getByRole("dialog").locator('[data-record-key="solar"]')).toBeDisabled();
});

test("energy-style record calendar presets and custom selections use local recorder dates", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Wetterrekorde öffnen" }).click();
  const dialog = page.getByRole("dialog");
  const picker = dialog.locator("ecowitt-record-date-selector");
  await expect(dialog.locator(".record-tile")).toHaveCount(9);
  await picker.getByRole("button", { name: "Kalender und Zeitraum auswählen" }).click();
  await expect(picker.locator(".picker-presets button")).toHaveCount(10);
  await expect(picker.getByRole("button", { name: "Diese Woche" })).toBeVisible();
  await picker.getByRole("button", { name: "Gestern", exact: true }).click();
  await picker.getByRole("button", { name: "Auswählen", exact: true }).click();
  await expect(dialog.locator(".record-tile")).toHaveCount(9);
  const requests = () => page.evaluate(() =>
    (window as DemoWindow).historyRequests.map(x => x.path));
  const yesterdayUrl = new URL((await requests()).at(-1)!, "http://fixture.invalid/");
  expect(yesterdayUrl.pathname).toContain("history/period/");
  expect(yesterdayUrl.searchParams.get("filter_entity_id")).toContain("sensor.demo_uv");
  await picker.getByRole("button", { name: "Kalender und Zeitraum auswählen" }).click();
  await expect(picker.locator(".picker-days button")).toHaveCount(42);
  await picker.getByRole("button", { name: "Abbrechen" }).click();
  await expect(picker.locator(".picker-days button")).toHaveCount(0);
  const before = (await requests()).length;
  await picker.getByRole("button", { name: "Vorheriger Zeitraum" }).click();
  await expect.poll(async () => (await requests()).length).toBeGreaterThan(before);
  await picker.getByRole("button", { name: "Jetzt" }).click();
  await expect(dialog.locator(".record-tile")).toHaveCount(9);
});

test("record-style current details preserve selected entities, live readings and graphs", async ({ page }) => {
  await ready(page);
  await page.locator('[data-detail="temperature"]:visible').first().click();
  const dialog = page.getByRole("dialog");
  const tiles = dialog.locator(".detail-reading.detail-record-tile");
  await expect(tiles).toHaveCount(7);
  await expect(tiles.locator(".detail-card-title").first()).toContainText("Außentemperatur");
  await expect(tiles.locator(".detail-source-name").first()).toContainText("WN32");
  await expect(tiles.locator(".detail-card-value").first()).toContainText("18");
  await expect(dialog.getByText("Verlauf · letzte", { exact: false })).toBeVisible();
  await expect(dialog.locator(".chart").first()).toBeVisible();
  await expect(tiles.first().getByRole("button", { name: "Sensor in HA öffnen" })).toBeVisible();
  await dialog.locator(".close").click();
  await setStatusDevices(page, 3);
  await page.locator('[data-detail="sensors"]:visible').first().click();
  await expect(dialog.locator(".device-detail-summary").first()).toBeVisible();
  await expect(dialog.locator(".sensor-row.sensor-record-tile").first()).toBeVisible();
  await expect(dialog.locator(".sensor-tile-title").first()).toBeVisible();
  await expect(dialog.locator(".sensor-tile-value").first()).not.toBeEmpty();
  await expect(dialog.locator(".sensor-row").first().getByRole("button", { name: "Sensor in HA öffnen" })).toBeVisible();
});

test("mobile Companion records retain working fixed overlay, scroll and close controls", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 402, height: 874 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Home Assistant/2026.11.0 (iOS) Mobile/HomeAssistant, like Safari",
  });
  try {
    const page = await context.newPage();
    for (const view of ["panel", "sections"]) {
      await ready(page, `/?view=${view}`);
      const open = page.getByRole("button", { name: "Wetterrekorde öffnen" });
      const rect = await open.boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      await open.tap();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Wetterrekorde");
      await expect(page.locator(".companion-overlay")).toBeVisible();
      await expect(dialog.locator(".record-tile")).toHaveCount(9);
      const calendar = dialog.locator("ecowitt-record-date-selector");
      await calendar.getByRole("button", { name: "Kalender und Zeitraum auswählen" }).tap();
      await expect(calendar.getByRole("button", { name: "Letzte 30 Tage" })).toBeVisible();
      await calendar.getByRole("button", { name: "Letzte 30 Tage" }).tap();
      await calendar.getByRole("button", { name: "Auswählen", exact: true }).tap();
      await expect(dialog.locator(".record-tile")).toHaveCount(9);
      const geometry = await dialog.evaluate(el => {
        const r = el.getBoundingClientRect();
        const content = el.querySelector(".detail-content")!;
        return { top: r.top, bottom: r.bottom,
          contentWidth: content.clientWidth, scrollWidth: content.scrollWidth };
      });
      expect(geometry.top).toBeGreaterThanOrEqual(71);
      expect(geometry.bottom).toBeLessThanOrEqual(874);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.contentWidth + 1);
      await dialog.locator(".detail-content").evaluate(el => { el.scrollTop = el.scrollHeight; });
      await dialog.locator(".close").tap();
      await expect(dialog).not.toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("details request local HA history lazily and support keyboard dismissal", async ({
  page,
}) => {
  await ready(page);
  expect(
    await page.evaluate(() => (window as DemoWindow).historyRequests.length),
  ).toBe(0);
  await page.locator('[data-detail="wind"]:visible').first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as DemoWindow).historyRequests.length),
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole("dialog").locator("svg").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.locator('[data-detail="rain"]:visible').first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/24/);
  await expect(dialog).toContainText(/Woche/);
  await expect(dialog).toContainText(/Monat/);
  await expect(dialog).toContainText(/Jahr/);
  await dialog.getByRole("button", { name: /Schließen/ }).click();
  await expect(dialog).not.toBeVisible();
});

test("empty and failed recorder history display honest feedback", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    (window as DemoWindow).historyMode = "empty";
  });
  await page.locator('[data-detail="wind"]:visible').first().click();
  await expect(page.getByRole("dialog")).toContainText(
    /keine|nicht verfügbar|fehlt/i,
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    (window as DemoWindow).historyMode = "error";
  });
  await page.locator('[data-detail="pressure"]:visible').first().click();
  await expect(page.getByRole("dialog")).toContainText(
    /nicht|Fehler|Recorder/i,
  );
});

test("additional sensors and diagnostics use only selected actual entities", async ({
  page,
}) => {
  await ready(page);
  await page.locator('[data-detail="sensors"]:visible').first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Beispiel Zusatzkanal · WN31");
  await expect(dialog).toContainText(/21[,.]4/);
  await expect(dialog).toContainText("Beispiel Batterie · WH40");
  await expect(dialog).toContainText("86");
});

test("external image sources do not issue requests to third parties", async ({
  page,
}) => {
  await ready(page);
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1")
      external.push(request.url());
  });
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({
      ...win.demoConfig,
      site_image: "https://example.com/private-property.png",
    });
    await win.card.updateComplete;
  });
  await expect(page.getByText(/Bildquelle|Bild|Quelle/).first()).toBeVisible();
  expect(external).toEqual([]);
});

test("visual editor emits persistent entity and image config changes", async ({
  page,
}) => {
  await ready(page, "/?editor=1");
  const editor = page.locator("ecowitt-weather-card-editor");
  await expect(editor).toBeVisible();
  await editor
    .locator("summary")
    .filter({ hasText: "Private Bildquelle" })
    .click();
  const image = editor
    .getByLabel(/Bildpfad|Bildquelle|Hintergrundbild/)
    .first();
  await image.fill("/local/example-weather.svg");
  await image.blur();
  await expect
    .poll(() =>
      page.evaluate(() => (window as DemoWindow).lastEditorConfig?.site_image),
    )
    .toBe("/local/example-weather.svg");
  const picker = editor.locator("ha-entity-picker").first();
  await picker.locator("select").selectOption("sensor.demo_wind_gust");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as DemoWindow).lastEditorConfig?.entities?.wind_speed,
      ),
    )
    .toBe("sensor.demo_wind_gust");
  const saved = await page.evaluate(
    () => (window as DemoWindow).lastEditorConfig,
  );
  await page.evaluate(async (config) => {
    const win = window as DemoWindow;
    win.editor.setConfig(config);
    await win.editor.updateComplete;
  }, saved);
  await expect(image).toHaveValue("/local/example-weather.svg");
});

test("light theme, reduced motion and mobile landscape remain usable", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 874, height: 402 });
  await ready(page, "/?theme=light&view=sections");
  await noOverflow(page);
  const duration = await page
    .locator(".flow-current")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(
    duration.split(",").every((part) => parseFloat(part) === 0),
  ).toBeTruthy();
  await page.locator('[data-detail="temperature"]:visible').first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /Schließen/ }),
  ).toBeVisible();
});

test("public screenshots use synthetic fixtures and generic illustration only", async ({
  page,
}) => {
  test.skip(
    !process.env.UPDATE_SCREENSHOTS,
    "Set UPDATE_SCREENSHOTS=1 to refresh the reviewed public fixtures.",
  );
  await mkdir("docs/screenshots", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await ready(page);
  await setStatusDevices(page, 3);
  await update(page, "rain_rate", 0, "mm/h");
  await setSky(page, 45, 700);
  await page.screenshot({
    path: "docs/screenshots/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 402, height: 874 });
  await update(page, "rain_rate", 3, "mm/h");
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
});

test("card is registered with native catalog, grid sizing and an editable stub", async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const win = window as DemoWindow;
    const Card = customElements.get("ecowitt-weather-card") as any;
    const stub = Card.getStubConfig(win.hass);
    const editor = await Card.getConfigElement();
    return {
      registered: (win as any).customCards?.some(
        (entry: any) => entry.type === "ecowitt-weather-card",
      ),
      stub,
      editor: editor.tagName,
      grid: win.card.getGridOptions(),
    };
  });
  expect(result.registered).toBeTruthy();
  expect(result.stub.type).toBe("custom:ecowitt-weather-card");
  expect(
    Object.values(result.stub.entities || {}).every(
      (id) => typeof id === "string" && id.startsWith("sensor.demo_"),
    ),
  ).toBeTruthy();
  expect(result.editor).toBe("ECOWITT-WEATHER-CARD-EDITOR");
  expect(result.grid).toBeTruthy();
});

test("local HA image and media-source replace the generic background without rotating the compass", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({
      ...win.demoConfig,
      site_image: "/demo/generic-image.svg",
      image_rotation: 90,
    });
    await win.card.updateComplete;
  });
  await expect(page.locator(".site-image")).toHaveAttribute(
    "src",
    /\/demo\/generic-image\.svg$/,
  );
  await expect(page.locator(".site-image")).toHaveCSS(
    "transform",
    "matrix(0, 1, -1, 0, 0, 0)",
  );
  await expect(page.locator(".north")).toHaveText("N");
  await expect(page.locator(".flow-current")).toHaveAttribute(
    "data-bearing",
    "292",
  );
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({
      ...win.demoConfig,
      site_image: "media-source://media_source/local/generic-image.svg",
    });
    await win.card.updateComplete;
  });
  await expect(page.locator(".site-image")).toHaveAttribute(
    "src",
    /\/demo\/generic-image\.svg$/,
  );
});

for (const view of ["panel", "sections"])
  for (const width of [402, 1440]) {
    test(`${view}: light theme at ${width}px preserves layout and readable source values`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 402 ? 874 : 1050 });
      await ready(page, `/?view=${view}&theme=light`);
      await noOverflow(page);
      await expect(page.locator('.metric[data-key="pressure_absolute"]')).toContainText(
        "998,6",
      );
      const contrast = await page
        .locator("ecowitt-weather-card")
        .evaluate((el) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d")!;
          const luminance = (color: string) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            const rgb = [...context.getImageData(0, 0, 1, 1).data]
              .slice(0, 3)
              .map((v) => {
                v /= 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
              });
            return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
          };
          const background = luminance(
            getComputedStyle(el.shadowRoot!.querySelector("ha-card")!)
              .backgroundColor,
          );
          return [
            ...el.shadowRoot!.querySelectorAll(".label,.from b,.wet-badge"),
          ]
            .filter((node) => node.getBoundingClientRect().width > 0)
            .map((node) => {
              const foreground = luminance(getComputedStyle(node).color);
              return (
                (Math.max(foreground, background) + 0.05) /
                (Math.min(foreground, background) + 0.05)
              );
            });
        });
      expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
    });
  }

test("HA media image resolves when hass becomes available after configuration", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.card.hass = undefined;
    win.card.setConfig({
      ...win.demoConfig,
      site_image: "media-source://media_source/local/generic-image.svg",
    });
    await win.card.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    win.card.hass = { ...win.hass };
    await win.card.updateComplete;
  });
  await expect(page.locator(".site-image")).toHaveAttribute(
    "src",
    /\/demo\/generic-image\.svg$/,
  );
});

test("calibrated arrow target remains inside the circular image", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({
      ...win.demoConfig,
      image_target_x: 10,
      image_target_y: 10,
    });
    await win.card.updateComplete;
  });
  const geometry = await page.locator(".target").evaluate((el) => ({
    x: Number(el.getAttribute("cx")),
    y: Number(el.getAttribute("cy")),
  }));
  expect(Math.hypot(geometry.x - 50, geometry.y - 50)).toBeLessThanOrEqual(
    40.01,
  );
  await expect(page.locator(".wind-layer")).toHaveCSS(
    "clip-path",
    "circle(50% at 50% 50%)",
  );
  await expect(page.locator(".flow-current")).toHaveAttribute(
    "data-flow-bearing",
    "112",
  );
});

test("mobile details scroll vertically without horizontal overflow at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await ready(page);
  for (const detail of ["rain", "wind", "sensors"]) {
    await page.locator(`[data-detail="${detail}"]:visible`).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const size = await dialog.evaluate((el) => ({
      width: el.clientWidth,
      scroll: el.scrollWidth,
      left: el.getBoundingClientRect().left,
      right: el.getBoundingClientRect().right,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
    expect(size.left).toBeGreaterThanOrEqual(0);
    expect(size.right).toBeLessThanOrEqual(320);
    await dialog.getByRole("button", { name: "Schließen" }).click();
  }
});

test("runtime uses only the local HA origin and missing individual sensors keep setup guidance", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).origin));
  await ready(page);
  expect([...new Set(requests)]).toEqual(["http://127.0.0.1:4173"]);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({
      type: "custom:ecowitt-weather-card",
      entities: { rain_today: win.demoConfig.entities.rain_today },
    });
    await win.card.updateComplete;
  });
  await expect(page.locator(".setup-missing")).toContainText(
    "Einrichtung vervollständigen",
  );
  await expect(page.locator('[data-key="rain_today"]').first()).toContainText(
    "3,2",
  );
  await expect(page.locator('[data-key="wind_speed"]').first()).toContainText(
    "Quelle auswählen",
  );
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "UNAVAILABLE",
  );
  await expect(page.locator(".flow-current")).toHaveCount(0);
});

test("rendered polygon travels from N/E/S/W and WNW into the target", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  for (const from of [0, 90, 180, 270, 292, 359, 0]) {
    await update(page, "wind_direction", from);
    const geometry = await page.locator(".flow-current").evaluate((el) => {
      const group = el as SVGGElement;
      const polygon = group.querySelector("polygon")!;
      const matrix = group.getCTM()!;
      const a = polygon.points.getItem(0),
        b = polygon.points.getItem(1),
        tip = polygon.points.getItem(4);
      const tail = new DOMPoint(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
      ).matrixTransform(matrix);
      const head = new DOMPoint(tip.x, tip.y).matrixTransform(matrix);
      const bearing = (x: number, y: number) =>
        ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
      const target = group
        .closest("svg")!
        .querySelector(".target") as SVGCircleElement;
      const targetPoint = new DOMPoint(
        target.cx.baseVal.value,
        target.cy.baseVal.value,
      ).matrixTransform(target.getCTM()!);
      return {
        from: bearing(tail.x - head.x, tail.y - head.y),
        flow: bearing(head.x - tail.x, head.y - tail.y),
        distanceToTarget: Math.hypot(
          head.x - targetPoint.x,
          head.y - targetPoint.y,
        ),
      };
    });
    expect(
      Math.min(
        Math.abs(geometry.from - from),
        360 - Math.abs(geometry.from - from),
      ),
    ).toBeLessThan(0.01);
    expect(geometry.flow).toBeCloseTo((from + 180) % 360, 2);
    expect(geometry.distanceToTarget).toBeLessThan(0.01);
  }
});

test("320px summary contains long German labels with a wider fallback font", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 874 });
  for (const view of ["panel", "sections"]) {
    await ready(page, `/?view=${view}`);
    await page.locator("ecowitt-weather-card").evaluate((card) => {
      // A real 16px monospace fallback exposes intrinsic grid minimums that can
      // differ between the local machine and GitHub's installed system fonts.
      (card as HTMLElement).style.setProperty(
        "--paper-font-body1_-_font-family",
        "monospace",
      );
    });
    const summary = page.locator(".mobile-summary");
    await expect(summary.locator(".label").nth(1)).toContainText(
      "Feuchtigkeitsstatus",
    );
    const layout = await summary.evaluate((element) => {
      const root = element.closest("ha-card")!.getBoundingClientRect();
      const nodes = [element, ...element.querySelectorAll("button, span")];
      return {
        font: getComputedStyle(element).fontFamily,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        outside: nodes
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.width > 0 &&
              (rect.left < root.left - 1 || rect.right > root.right + 1)
            );
          })
          .map((node) => node.className),
        overflowing: nodes
          .filter(
            (node) =>
              node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1,
          )
          .map((node) => node.className),
      };
    });
    expect(layout.font).toContain("monospace");
    expect(layout.pageOverflow).toBe(false);
    expect(layout.outside).toEqual([]);
    expect(layout.overflowing).toEqual([]);
  }
});

test("measured WH40 rain is visualized in the image and tile while wet Piezo remains separate", async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator(".sky-banner")).toHaveCount(0);
  await expect(page.locator(".site .scene-drop-track")).toHaveCount(24);
  await expect(page.locator(".site .scene-splash")).toHaveCount(7);
  await expect(page.locator(".rain .scene-drop-track")).toHaveCount(16);
  await expect(page.locator(".weather-info summary")).toContainText("Regen");
  await update(page, "rain_rate", 0, "mm/h");
  await update(page, "rain_wet", "on");
  await expect(page.locator(".scene-drop-track")).toHaveCount(0);
  // With a usable local lux source, the sky can remain a neutral
  // daylight scene even though the measured precipitation stopped.
  await expect(page.locator(".weather-info summary")).toContainText(
    "Tag",
  );
  await expect(page.locator(".site .weather-scene")).toHaveAttribute(
    "data-scene-weather", "daylight",
  );
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "NASS",
  );
});

test("source-grounded device status shows battery percent, raw dBm and real connectivity", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    const now = new Date().toISOString();
    const items = [
      ["sensor.test_ws90_battery", "64", "%", "battery"],
      ["sensor.test_ws90_signal", "-68", "dBm", "signal_strength"],
      ["binary_sensor.test_ws90_connected", "on", "", "connectivity"],
    ] as const;
    for (const [id, state, unit, deviceClass] of items)
      win.hass.states[id] = {
        entity_id: id,
        state,
        last_updated: now,
        last_changed: now,
        attributes: {
          friendly_name: id,
          unit_of_measurement: unit,
          device_class: deviceClass,
        },
      };
    win.setDemoConfig({
      ...win.demoConfig,
      device_status: [
        {
          device_id: "demo-ws90",
          role: "WS90",
          name: "Test WS90",
          show_on_main: true,
          battery: "sensor.test_ws90_battery",
          signal: "sensor.test_ws90_signal",
          connection: "binary_sensor.test_ws90_connected",
        },
      ],
    });
    await win.card.updateComplete;
  });
  const badge = page.locator(".device-chip");
  await expect(badge).toContainText("WS90");
  await expect(badge).toContainText("64 %");
  await expect(badge).toContainText("-68 dBm");
  await expect(badge).toContainText("Verbunden");
  const signalPath = await badge
    .locator('[data-icon="signal"] path')
    .getAttribute("d");
  expect(signalPath).not.toBe(
    await page.locator('[data-icon="sun"] path').first().getAttribute("d"),
  );
  expect(signalPath).toContain("M4 20");
  await page.locator(".device-chip").click();
  await expect(page.getByRole("dialog")).toContainText("Test WS90");
});

test("saved per-device status fields stay selected through registry and HA re-renders", async ({ page }) => {
  await ready(page, "/?editor=1");
  const saved = await page.evaluate(async () => {
    const win = window as DemoWindow;
    const configured = [
      {
        device_id: "demo-ws90", role: "WS90", name: "Beispiel Windstation",
        show_on_main: true,
        battery: "sensor.demo_ws90_battery_status",
        signal: "sensor.demo_ws90_signal_status",
        connection: "binary_sensor.demo_ws90_online_status",
      },
      {
        device_id: "demo-wn32", role: "WN32", name: "Beispiel Außensensor",
        show_on_main: true,
        battery: "sensor.demo_wn32_battery_status",
        signal: "sensor.demo_wn32_signal_status",
        connection: "binary_sensor.demo_wn32_online_status",
      },
    ];
    const now = new Date().toISOString();
    for (const device of configured) {
      for (const kind of ["battery", "signal", "online"] as const) {
        const id = kind === "online" ? device.connection : kind === "battery" ? device.battery : device.signal;
        win.hass.states[id] = {
          entity_id: id, state: kind === "online" ? "on" : kind === "battery" ? "100" : "76",
          last_changed: now, last_updated: now,
          attributes: {
            friendly_name: `Beispiel ${kind}`,
            device_class: kind === "online" ? "connectivity" : kind === "battery" ? "battery" : "signal_strength",
            ...(kind === "online" ? {} : { unit_of_measurement: "%" }),
          },
        };
      }
    }
    win.editor.hass = { ...win.hass, states: { ...win.hass.states } };
    win.editor.setConfig({ ...win.demoConfig, device_status: configured });
    await win.editor.updateComplete;
    return configured;
  });
  const editor = page.locator("ecowitt-weather-card-editor");
  await editor.locator("summary").filter({ hasText: "Zusatzsensoren & Diagnosen" }).click();
  const section = editor.locator(".device-editor");
  await expect(section).toBeVisible();

  for (const device of saved) {
    const group = section.locator(`.device-config[data-device-id="${device.device_id}"]`);
    await expect(group).toHaveCount(1);
    await expect(group.locator('select[data-device-field="battery"]')).toHaveValue(device.battery);
    await expect(group.locator('select[data-device-field="signal"]')).toHaveValue(device.signal);
    await expect(group.locator('select[data-device-field="connection"]')).toHaveValue(device.connection);
  }

  // The browser can reset a native select while options are reconstructed
  // asynchronously. Re-rendering with identical config must restore the
  // displayed selection; it must never overwrite the saved values.
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    const root = win.editor.shadowRoot as ShadowRoot;
    for (const select of root.querySelectorAll<HTMLSelectElement>(".device-config select[data-device-field]")) {
      select.value = "";
    }
    win.editor.requestUpdate();
    await win.editor.updateComplete;
  });
  for (const device of saved) {
    const group = section.locator(`.device-config[data-device-id="${device.device_id}"]`);
    for (const field of ["battery", "signal", "connection"] as const) {
      await expect(group.locator(`select[data-device-field="${field}"]`)).toHaveValue(device[field]);
    }
  }

  // Even a previously configured entity temporarily absent from HA must
  // remain explicitly selected, rather than showing "Nicht zugeordnet".
  await page.evaluate(async (id) => {
    const win = window as DemoWindow;
    delete win.hass.states[id];
    win.editor.hass = { ...win.hass, states: { ...win.hass.states } };
    await win.editor.updateComplete;
  }, saved[1].battery);
  await expect(section.locator(
    '.device-config[data-device-id="demo-wn32"] select[data-device-field="battery"]',
  )).toHaveValue(saved[1].battery);

  const persisted = await page.evaluate(() => (window as DemoWindow).editor._config.device_status);
  for (const expected of saved) {
    const actual = persisted.find((item: any) => item.device_id === expected.device_id);
    expect(actual).toMatchObject(expected);
  }
});

test("device editor uses one checklist and preserves legacy config while saving new device extras", async ({
  page,
}) => {
  await ready(page, "/?editor=1");
  const editor = page.locator("ecowitt-weather-card-editor");
  await editor
    .locator("summary")
    .filter({ hasText: "Darstellung, Wetteranimation" })
    .click();
  await editor.getByLabel("Farbschema").selectOption("dark");
  await expect
    .poll(() =>
      page.evaluate(() => (window as DemoWindow).lastEditorConfig?.theme_mode),
    )
    .toBe("dark");
  const initial = await page.evaluate(
    () => (window as DemoWindow).lastEditorConfig,
  );
  expect(initial.extra_entities).toEqual(["sensor.demo_extra"]);
  expect(initial.diagnostic_entities).toEqual(["sensor.demo_battery"]);
  await editor
    .locator("summary")
    .filter({ hasText: "Zusatzsensoren & Diagnosen" })
    .click();
  const device = editor.locator('.device-config[data-device-id="demo-wn31"]');
  await device.locator("summary").click();
  await expect(editor.locator("select[multiple]")).toHaveCount(0);
  const existing = device
    .locator(".check-row")
    .filter({ hasText: "Beispiel Zusatzkanal WN31" })
    .locator('input[type="checkbox"]');
  await expect(existing).toBeChecked();
  await existing.uncheck();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as DemoWindow).lastEditorConfig?.extra_entities?.length,
      ),
    )
    .toBe(0);
  await existing.check();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as DemoWindow).lastEditorConfig?.device_status?.find(
            (d: any) => d.device_id === "demo-wn31",
          )?.extra_entities,
      ),
    )
    .toEqual(["sensor.demo_extra"]);
  expect(
    await page.evaluate(
      () => (window as DemoWindow).lastEditorConfig?.diagnostic_entities,
    ),
  ).toEqual(["sensor.demo_battery"]);
  const saved = await page.evaluate(
    () => (window as DemoWindow).lastEditorConfig,
  );
  await page.evaluate(async (config) => {
    const win = window as DemoWindow;
    win.editor.setConfig(config);
    await win.editor.updateComplete;
  }, saved);
  await expect(existing).toBeChecked();
  await page.locator('[data-detail="sensors"]:visible').first().click();
  await expect(
    page
      .getByRole("dialog")
      .locator('.sensor-row[data-entity-id="sensor.demo_extra"]'),
  ).toHaveCount(1);
});

async function setSky(
  page: Page,
  elevation: number,
  solar: number,
  unit = "W/m²",
  state = "above_horizon",
) {
  await page.evaluate(
    async ({ elevation, solar, unit, state }) => {
      const win = window as DemoWindow;
      const now = new Date().toISOString();
      win.hass.states["sun.sun"] = {
        entity_id: "sun.sun",
        state,
        last_updated: now,
        last_changed: now,
        attributes: { elevation },
      };
      win.updateDemo("solar", solar, unit);
      win.card.hass = { ...win.hass };
      await win.card.updateComplete;
    },
    { elevation, solar, unit, state },
  );
}

for (const width of [320, 375, 390, 402, 430, 600, 768, 874, 1024, 1440]) {
  test(`compass labels stay outside the circle without overlap or clipping at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 874 ? 402 : 874 });
    await ready(page);
    await expect(page.locator(".degree-ring [data-degrees]")).toHaveCount(8);
    const results = await page.locator(".site").evaluate((site) => {
      const circle = site.getBoundingClientRect();
      const card = site.closest("ha-card")!.getBoundingClientRect();
      const cx = (circle.left + circle.right) / 2,
        cy = (circle.top + circle.bottom) / 2;
      const radius = circle.width / 2;
      const cardinals = [...site.querySelectorAll(".cardinal")].map((node) =>
        node.getBoundingClientRect(),
      );
      const overlap = (a: DOMRect, b: DOMRect) =>
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top;
      return [...site.querySelectorAll(".degree-ring [data-degrees]")].map(
        (node) => {
          const box = node.getBoundingClientRect();
          const nearestX = Math.max(box.left, Math.min(cx, box.right));
          const nearestY = Math.max(box.top, Math.min(cy, box.bottom));
          return {
            label: node.textContent,
            outsideCircle: Math.hypot(nearestX - cx, nearestY - cy) > radius,
            overlapsCardinal: cardinals.some((cardinal) =>
              overlap(box, cardinal),
            ),
            clipped:
              box.left < card.left ||
              box.right > card.right ||
              box.top < card.top ||
              box.bottom > card.bottom,
            color: getComputedStyle(node).color,
            stroke: getComputedStyle(node).stroke,
            textHeight: box.height,
            cardinalHeight: cardinals[0].height,
          };
        },
      );
    });
    for (const result of results) {
      expect(result.outsideCircle, result.label || "degree").toBe(true);
      expect(result.overlapsCardinal, result.label || "degree").toBe(false);
      expect(result.clipped, result.label || "degree").toBe(false);
      expect(result.color).not.toBe("rgb(255, 255, 255)");
      expect(result.stroke).toBe("none");
      expect(result.textHeight).toBeLessThan(result.cardinalHeight / 2);
    }
    await noOverflow(page);
  });
}

test("wet surface coexists with sun and clouds over the unchanged image; measured rain takes priority", async ({
  page,
}) => {
  await ready(page);
  await update(page, "rain_rate", 0, "mm/h");
  await update(page, "rain_wet", "on");
  await setSky(page, 45, 700);
  const scene = page.locator(".site .weather-scene");
  await expect(scene).toHaveAttribute("data-scene-weather", "sunny");
  await expect(page.locator(".site .scene-sun")).toHaveCount(1);
  await expect(page.locator(".weather-info summary")).toContainText(
    "geschätzt",
  );
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "NASS",
  );
  await expect(page.locator(".rain .scene-sun")).toHaveCount(1);
  await setSky(page, 15, 150);
  await expect(scene).toHaveAttribute("data-scene-weather", "partlycloudy");
  await expect(page.locator(".site .scene-cloud--near")).toHaveCount(1);
  await setSky(page, 45, 30);
  await expect(scene).toHaveAttribute("data-scene-weather", "cloudy");
  await expect(page.locator(".site .scene-sun")).toHaveCount(0);
  await update(page, "rain_rate", 0.8, "mm/h");
  await expect(scene).toHaveAttribute("data-scene-weather", "rain");
  await expect(page.locator(".site .scene-drop-track")).toHaveCount(24);
});

test("night, low daylight and incomplete observations have independent moisture status", async ({
  page,
}) => {
  await ready(page);
  await update(page, "rain_rate", 0, "mm/h");
  await update(page, "rain_wet", "off");
  await setSky(page, -10, 0, "W/m²", "below_horizon");
  await expect(page.locator(".site .weather-scene")).toHaveAttribute(
    "data-scene-weather",
    "night",
  );
  await expect(page.locator(".site .scene-moon")).toHaveCount(1);
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "TROCKEN",
  );
  await setSky(page, 5, 35);
  await expect(page.locator(".site .weather-scene")).toHaveAttribute(
    "data-scene-weather",
    "daylight",
  );
  await expect(page.locator(".site .scene-sun,.site .scene-cloud")).toHaveCount(
    0,
  );
  await setSky(page, 45, 0.7, "kW/m²");
  await expect(page.locator(".site .weather-scene")).toHaveAttribute(
    "data-scene-weather",
    "sunny",
  );
  await update(page, "solar", "unavailable");
  await expect(page.locator(".site .weather-scene")).toHaveCount(0);
  await expect(page.locator(".weather-info summary")).toContainText(
    "Wetterdaten ergänzen",
  );
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    delete win.hass.states["sun.sun"];
    win.card.hass = { ...win.hass };
    await win.card.updateComplete;
  });
  // A valid local lux reading keeps the light phase usable even when the
  // optional astronomical sun source is temporarily missing.
  await expect(page.locator(".site .weather-scene")).toHaveAttribute(
    "data-scene-weather", "daylight",
  );
  await page.locator(".weather-info summary").click();
  await expect(page.locator(".weather-info p")).toContainText(/Lokal gemessene Beleuchtungsstärke/);
});

test("main rain tile uses positive WH40 first, then positive WS90 if WH40 shows zero", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    const id = "sensor.demo_secondary_precipitation";
    const now = new Date().toISOString();
    win.hass.states[id] = {
      entity_id: id, state: "0.6", last_updated: now, last_changed: now,
      attributes: {
        friendly_name: "Beispiel WS90-Regenrate",
        unit_of_measurement: "mm/h",
        device_class: "precipitation_intensity",
      },
    };
    win.setDemoConfig({
      ...win.demoConfig,
      entities: { ...win.demoConfig.entities, rain_rate_secondary: id },
    });
    await win.card.updateComplete;
  });
  await update(page, "rain_rate", 0, "mm/h");
  const rate = page.locator(".rain [data-key='rain_rate']");
  await expect(rate).toContainText("0,6");
  await expect(rate).toContainText("WS90");
  await expect(page.locator(".rain .weather-scene")).toHaveAttribute("data-scene-weather", "rain");
  await expect(page.locator(".site .weather-scene")).toHaveAttribute("data-scene-weather", "rain");
  await update(page, "rain_rate", 1.3, "mm/h");
  await expect(rate).toContainText("1,3");
  await expect(rate).not.toContainText("WS90");
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    const id = "sensor.demo_secondary_precipitation";
    win.hass.states[id] = { ...win.hass.states[id], state: "0",
      last_updated: new Date().toISOString() };
    win.card.hass = { ...win.hass, states: { ...win.hass.states } };
    await win.card.updateComplete;
  });
  await update(page, "rain_rate", 0, "mm/h");
  await expect(rate).toContainText("0,0");
  await expect(rate).not.toContainText("WS90");
  await expect(page.locator(".site .scene-drop-track")).toHaveCount(0);
});

test("met.no-like nighttime cloud and rain conditions never invent local precipitation", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await ready(page);
  await update(page, "rain_rate", 0, "mm/h");
  await update(page, "solar_lux", 0, "lx");
  await setSky(page, -16, 0, "W/m²", "below_horizon");
  const condition = async (state: string) => {
    await page.evaluate(async (nextState) => {
      const win = window as DemoWindow;
      const id = "weather.demo_regional";
      win.hass.states[id] = {
        entity_id: id, state: nextState,
        last_updated: new Date().toISOString(),
        attributes: { friendly_name: "Beispiel Wetterquelle" },
      };
      win.setDemoConfig({ ...win.demoConfig, weather_entity: id,
        night_lux_threshold: 0, day_lux_threshold: 10 });
      await win.card.updateComplete;
    }, state);
  };
  const sky = page.locator(".site .weather-scene");
  await condition("clear-night");
  await expect(sky).toHaveAttribute("data-scene-weather", "night");
  await expect(sky.locator(".scene-moon")).toHaveCount(1);
  await expect(sky.locator(".scene-stars")).toHaveCount(1);

  await condition("cloudy");
  await expect(sky).toHaveAttribute("data-scene-time", "night");
  await expect(sky).toHaveAttribute("data-scene-weather", "cloudy");
  await expect(sky.locator(".scene-cloud")).toHaveCount(2);
  await expect(sky.locator(".scene-stars")).toHaveCount(0);

  await condition("rainy");
  await expect(sky).toHaveAttribute("data-scene-weather", "cloudy");
  await expect(sky).toHaveAttribute("data-scene-time", "night");
  await expect(sky.locator(".scene-drop-track")).toHaveCount(0);

  await update(page, "rain_rate", 0.8, "mm/h");
  await expect(sky).toHaveAttribute("data-scene-weather", "rain");
  await expect(sky).toHaveAttribute("data-scene-time", "night");
  await expect(sky.locator(".scene-drop-track")).toHaveCount(24);

  await update(page, "rain_rate", 0, "mm/h");
  await setSky(page, 42, 500);
  await update(page, "solar_lux", 25000, "lx");
  await expect(sky).toHaveAttribute("data-scene-weather", "cloudy");
  await expect(sky).toHaveAttribute("data-scene-time", "day");
  await expect(sky.locator(".scene-drop-track")).toHaveCount(0);
  await noOverflow(page);
});

test("lux thresholds including zero and sun.sun plausibility govern light scenes", async ({ page }) => {
  await ready(page);
  await update(page, "rain_rate", 0, "mm/h");
  await setSky(page, 3, 25);
  await update(page, "solar_lux", 0, "lx");
  await expect(page.locator(".site .weather-scene")).toHaveAttribute("data-scene-weather", "night");
  await expect(page.locator(".site .scene-stars")).toHaveCount(1);
  await update(page, "solar_lux", 20, "lx");
  await expect(page.locator(".site .weather-scene")).toHaveAttribute("data-scene-weather", "daylight");

  await setSky(page, 45, 650);
  await update(page, "solar_lux", 0, "lx");
  await expect(page.locator(".site .weather-scene")).toHaveAttribute("data-scene-weather", "sunny");
  await expect(page.locator(".weather-info summary")).toContainText("geschätzt");

  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.hass.states["sensor.demo_solar_lux"] = {
      ...win.hass.states["sensor.demo_solar_lux"], state: "unavailable",
      last_updated: new Date().toISOString(),
    };
    win.card.hass = { ...win.hass, states: { ...win.hass.states } };
    await win.card.updateComplete;
  });
  await setSky(page, -15, 0, "W/m²", "below_horizon");
  await expect(page.locator(".site .weather-scene")).toHaveAttribute("data-scene-weather", "night");
  await expect(page.locator(".site .weather-scene")).toHaveAttribute("data-scene-time", "night");
});

test("visual editor persists both freely configured lux thresholds and an explicit zero", async ({ page }) => {
  await ready(page, "/?editor=1");
  await page.getByText("Darstellung, Wetteranimation und Theme", { exact: true }).click();
  const night = page.getByLabel("Nachtszene bei höchstens · Lux", { exact: true });
  const day = page.getByLabel("Tagesdarstellung ab · Lux", { exact: true });
  await expect(night).toHaveValue("0");
  await expect(day).toHaveValue("10");
  await night.fill("0");
  await night.dispatchEvent("change");
  await day.fill("35");
  await day.dispatchEvent("change");
  await expect.poll(() => page.evaluate(
    () => (window as DemoWindow).lastEditorConfig?.day_lux_threshold,
  )).toBe(35);
  expect(await page.evaluate(
    () => (window as DemoWindow).lastEditorConfig?.night_lux_threshold,
  )).toBe(0);
});
test("weather preferences retain static visible rain and preserve independent wind transitions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({ ...win.demoConfig, weather_animation: false });
    await win.card.updateComplete;
  });
  await expect(page.locator(".site .weather-scene")).toHaveClass(
    /weather-scene--still/,
  );
  await expect(page.locator(".scene-drop-track").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".flow-current")).toHaveCSS(
    "transition-duration",
    "1.1s",
  );
  const drop = await page
    .locator(".site .scene-drop-track")
    .first()
    .evaluate((el) => ({
      y: el.getBoundingClientRect().top,
      top: el.closest(".site")!.getBoundingClientRect().top,
      bottom: el.closest(".site")!.getBoundingClientRect().bottom,
    }));
  expect(drop.y).toBeGreaterThan(drop.top);
  expect(drop.y).toBeLessThan(drop.bottom);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({ ...win.demoConfig, weather_animation: true });
    await win.card.updateComplete;
  });
  await expect(page.locator(".scene-drop-track").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".flow-current")).toHaveCSS(
    "transition-duration",
    "0s",
  );
});

for (const hostTheme of ["light", "dark"])
  for (const mode of ["auto", "light", "dark"]) {
    test(`theme ${mode} honors its scope inside a ${hostTheme} HA theme`, async ({
      page,
    }) => {
      await ready(page, hostTheme === "light" ? "/?theme=light" : "/");
      await page.evaluate(async (mode) => {
        const win = window as DemoWindow;
        win.setDemoConfig({ ...win.demoConfig, theme_mode: mode });
        await win.card.updateComplete;
      }, mode);
      const expected =
        mode === "auto"
          ? hostTheme === "light"
            ? "rgb(16, 38, 55)"
            : "rgb(238, 244, 250)"
          : mode === "light"
            ? "rgb(23, 43, 62)"
            : "rgb(237, 245, 252)";
      await expect(page.locator("ha-card")).toHaveCSS("color", expected);
      await page.locator('[data-detail="pressure"]:visible').first().click();
      await expect(page.getByRole("dialog")).toHaveCSS("color", expected);
      const background = await page
        .getByRole("dialog")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      if (mode === "auto") {
        await page.evaluate(() => document.body.classList.toggle("light"));
        await expect(page.locator("ha-card")).toHaveCSS(
          "color",
          hostTheme === "light" ? "rgb(238, 244, 250)" : "rgb(16, 38, 55)",
        );
      }
    });
  }

for (const view of ["panel", "sections"])
  for (const portrait of [true, false])
    for (const theme of ["light", "dark"]) {
      test(`${view} mobile ${portrait ? "portrait" : "landscape"} ${theme}: every detail opens, scrolls and closes`, async ({
        page,
      }) => {
        const width = portrait ? 402 : 874,
          height = portrait ? 874 : 402;
        await page.setViewportSize({ width, height });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await ready(
          page,
          `/?view=${view}&theme=${theme === "light" ? "dark" : "light"}`,
        );
        await page.evaluate(async (theme) => {
          const win = window as DemoWindow;
          win.setDemoConfig({ ...win.demoConfig, theme_mode: theme });
          await win.card.updateComplete;
        }, theme);
        for (const detail of [
          "wind",
          "rain",
          "temperature",
          "pressure",
          "sun",
          "sensors",
        ]) {
          const opener = page
            .locator(`[data-detail="${detail}"]:visible`)
            .first();
          await opener.click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await expect(dialog.locator("h2")).not.toBeEmpty();
          const bounds = await dialog.evaluate((el) => ({
            top: el.getBoundingClientRect().top,
            bottom: el.getBoundingClientRect().bottom,
            left: el.getBoundingClientRect().left,
            right: el.getBoundingClientRect().right,
            width: el.clientWidth,
            scrollWidth: el.scrollWidth,
            height: el.clientHeight,
            scrollHeight: el.scrollHeight,
          }));
          expect(bounds.top).toBeGreaterThanOrEqual(-1);
          expect(bounds.bottom).toBeLessThanOrEqual(height + 1);
          expect(bounds.left).toBeGreaterThanOrEqual(-1);
          expect(bounds.right).toBeLessThanOrEqual(width + 1);
          expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
          await page.keyboard.press("Tab");
          expect(
            await dialog.evaluate((el) =>
              el.contains((el.getRootNode() as ShadowRoot).activeElement),
            ),
          ).toBe(true);
          const scroller = dialog.locator(".detail-content");
          const canScroll = await scroller.evaluate(
            (el) => el.scrollHeight > el.clientHeight + 2,
          );
          if (canScroll) {
            await scroller.hover();
            await page.mouse.wheel(0, 600);
            await expect
              .poll(() => scroller.evaluate((el) => el.scrollTop))
              .toBeGreaterThan(0);
          }
          const close = dialog.getByRole("button", { name: "Schließen" });
          await expect(close).toBeVisible();
          await close.click();
          await expect(dialog).not.toBeVisible();
          await expect(opener).toBeFocused();
        }
        expect(errors).toEqual([]);
      });
    }

test("UV Index sources render while incompatible UV and signal units stay neutral", async ({
  page,
}) => {
  await ready(page);
  await update(page, "uv", 4.2, "UV Index");
  await expect(
    page.locator('[data-key="uv"]').first().locator(".value"),
  ).toHaveText(/^4\s*UV Index$/);
  await expect(page.locator('[data-key="uv"]').first()).not.toContainText(
    "Quelle prüfen",
  );
  await update(page, "uv", 4.2, "W/m²");
  await expect(page.locator('[data-key="uv"]').first()).toContainText(
    "Quelle prüfen",
  );
  await update(page, "uv", "unavailable", "UV Index");
  await expect(page.locator('[data-key="uv"]').first()).toContainText(
    "Nicht verfügbar",
  );
});

test("changing or clearing image config cannot restore a stale resolved image", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({
      ...win.demoConfig,
      site_image: "/demo/generic-image.svg",
    });
    await win.card.updateComplete;
  });
  await expect(page.locator(".site-image")).toHaveCount(1);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({ ...win.demoConfig, site_image: "" });
    await win.card.updateComplete;
  });
  await expect(page.locator(".site-image")).toHaveCount(0);
  await expect(page.locator(".demo-plan")).toHaveCount(1);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    let resolveMedia!: (value: { url: string }) => void;
    win.hass = {
      ...win.hass,
      callWS: () =>
        new Promise((resolve) => {
          resolveMedia = resolve;
        }),
    };
    win.setDemoConfig({
      ...win.demoConfig,
      site_image: "media-source://media_source/local/delayed.svg",
    });
    await win.card.updateComplete;
    win.setDemoConfig({ ...win.demoConfig, site_image: "" });
    resolveMedia({ url: "/demo/generic-image.svg" });
    await Promise.resolve();
    await win.card.updateComplete;
  });
  await expect(page.locator(".site-image")).toHaveCount(0);
  await expect(page.locator(".demo-plan")).toHaveCount(1);
});

test("unrelated config changes retain an already resolved local media image", async ({
  page,
}) => {
  await ready(page);
  const calls = await page.evaluate(async () => {
    const win = window as DemoWindow;
    let calls = 0;
    win.hass = {
      ...win.hass,
      callWS: async () => {
        calls++;
        return { url: "/demo/generic-image.svg" };
      },
    };
    const config = {
      ...win.demoConfig,
      site_image: "media-source://media_source/local/generic.svg",
    };
    win.setDemoConfig(config);
    await win.card.updateComplete;
    await Promise.resolve();
    await win.card.updateComplete;
    win.setDemoConfig({ ...config, title: "Neuer Titel" });
    await win.card.updateComplete;
    return calls;
  });
  expect(calls).toBe(1);
  await expect(page.locator(".site-image")).toHaveCount(1);
});

test("cancelled pending detail opens do not resurrect a dialog or request history", async ({
  page,
}) => {
  for (const action of ["config", "cancel", "disconnect"]) {
    await ready(page);
    await page.evaluate(async (action) => {
      const win = window as DemoWindow;
      const card = win.card;
      card.shadowRoot.querySelector('[data-detail="wind"]').click();
      if (action === "config")
        card.setConfig({
          ...win.demoConfig,
          title: "Konfiguration gewechselt",
        });
      else if (action === "cancel")
        card.shadowRoot
          .querySelector("dialog")
          .dispatchEvent(new Event("cancel", { cancelable: true }));
      else {
        card.remove();
        document.querySelector("main")!.append(card);
      }
      await card.updateComplete;
      await Promise.resolve();
      await card.updateComplete;
    }, action);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(
      await page.evaluate(() => (window as DemoWindow).historyRequests.length),
    ).toBe(0);
  }
});

async function setStatusDevices(page: Page, count: number, longNames = false) {
  await page.evaluate(
    async ({ count, longNames }) => {
      const win = window as DemoWindow;
      const now = new Date().toISOString();
      const roles = ["WS90", "WH40", "WN31", "GW3000", "WN32"];
      const devices = roles.slice(0, count).map((role, index) => {
        const base = `sensor.demo_status_${index}`;
        for (const [suffix, state, unit, device_class] of [
          ["battery", "72", "%", "battery"],
          ["signal", "-61", "dBm", "signal_strength"],
        ] as const) {
          const id = base + "_" + suffix;
          win.hass.states[id] = {
            entity_id: id,
            state,
            last_updated: now,
            attributes: { unit_of_measurement: unit, device_class },
          };
        }
        const connection = `binary_sensor.demo_status_${index}_connection`;
        win.hass.states[connection] = {
          entity_id: connection,
          state: "on",
          last_updated: now,
          attributes: { device_class: "connectivity" },
        };
        return {
          device_id: `demo-status-${index}`,
          role,
          name: longNames
            ? `${role} · Zusätzliche lokale Messstation mit langer Beschriftung`
            : role,
          show_on_main: true,
          battery: base + "_battery",
          signal: base + "_signal",
          connection,
        };
      });
      win.setDemoConfig({
        ...win.demoConfig,
        title: longNames
          ? "Lokale Wetterstation mit längerer Überschrift"
          : "Wetterstation (Ecowitt)",
        device_status: devices,
      });
      await win.card.updateComplete;
    },
    { count, longNames },
  );
}

test("device status chips use original readable sizes and only configured indicators", async ({ page }) => {
  await withNativeHaCard(page);
  for (const width of [402, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    await setStatusDevices(page, 5);
    await page.evaluate(async () => {
      const win = window as DemoWindow;
      const devices = win.card._config.device_status.map((device: any, index: number) =>
        index === 3
          ? { ...device, battery: "", signal: undefined }
          : index === 4
            ? { ...device, battery: "", signal: "", connection: "" }
            : device,
      );
      // An assigned but unavailable entity must still show an unknown
      // status rather than disappearing as though it had not been configured.
      win.hass.states["sensor.demo_status_1_signal"].state = "unavailable";
      win.setDemoConfig({ ...win.demoConfig, device_status: devices });
      await win.card.updateComplete;
    });
    const chips = page.locator(".header-devices .device-chip");
    await expect(chips).toHaveCount(5);
    const gateway = chips.nth(3);
    const unassigned = chips.nth(4);
    await expect(gateway.locator(".status-battery, .status-signal")).toHaveCount(0);
    await expect(gateway.locator(".status-connection")).toHaveCount(1);
    await expect(unassigned.locator(".status-battery, .status-signal, .status-connection")).toHaveCount(0);
    await expect(unassigned.locator("strong")).toHaveText("WN32");
    await expect(chips.nth(1).locator(".status-signal")).toContainText("—");
    await expect(chips.nth(0).locator(".status-battery")).toContainText("%");

    const appearance = await chips.evaluateAll((items) => {
      const box = (node: Element) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      return items.map((node) => ({
        ...box(node),
        width: node.clientWidth,
        overflow: node.scrollWidth - node.clientWidth,
        font: parseFloat(getComputedStyle(node).fontSize),
        headingFont: parseFloat(getComputedStyle(node.querySelector("strong")!).fontSize),
        batteryWidth: node.querySelector(".battery-glyph")?.getBoundingClientRect().width,
        signalWidth: node.querySelector(".status-signal .icon")?.getBoundingClientRect().width,
      }));
    });
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    for (const chip of appearance) {
      expect(chip.overflow).toBeLessThanOrEqual(1);
      expect(chip.font / rem).toBeCloseTo(0.69, 2);
      expect(chip.headingFont / rem).toBeCloseTo(0.78, 2);
    }
    expect(appearance[0].batteryWidth).toBeCloseTo(21, 0);
    expect(appearance[0].signalWidth).toBeCloseTo(16, 0);
    if (width >= 901) {
      expect(appearance[3].right - appearance[3].left).toBeLessThan(
        appearance[0].right - appearance[0].left,
      );
      expect(appearance[4].right - appearance[4].left).toBeLessThan(
        appearance[3].right - appearance[3].left,
      );
      await expect(gateway.locator(".status-connection-compact")).toBeVisible();
      await expect(gateway.locator(".status-connection-compact")).toHaveText("OK");
      await expect(gateway.locator(".status-connection-full")).toBeHidden();
      const bounds = await page.locator("ecowitt-weather-card").evaluate((host) => {
        const root = host.shadowRoot!;
        const r = (selector: string) => root.querySelector(selector)!.getBoundingClientRect();
        return {
          card: r("ha-card"), records: r(".records-trigger"),
          diagnostics: r(".diagnostics"), climate: r(".weather > .climate"),
        };
      });
      expect(bounds.records.bottom).toBeLessThanOrEqual(bounds.climate.top);
      expect(bounds.diagnostics.bottom).toBeLessThanOrEqual(bounds.climate.top);
      expect(bounds.records.right).toBeLessThanOrEqual(bounds.card.right);
    } else {
      // Deliberately full-width mobile rows retain the original layout.
      for (const chip of appearance) {
        expect(chip.right - chip.left).toBeCloseTo(
          appearance[0].right - appearance[0].left, 0,
        );
      }
      await expect(gateway.locator(".status-connection-full")).toBeVisible();
      await expect(gateway.locator(".status-connection-full")).toContainText("Verbunden");
      await expect(gateway.locator(".status-connection-compact")).toBeHidden();
      const footer = await page.locator(".header-devices").boundingBox();
      const metrics = await page.locator(".metrics").boundingBox();
      expect(footer!.y).toBeGreaterThan(metrics!.y + metrics!.height);
    }
    await noOverflow(page);
  }
});

for (const width of [320, 402, 874, 1440])
  for (const count of [1, 3])
    for (const theme of ["light", "dark"]) {
      test(`${width}px ${theme}: ${count} device statuses fit below the title on phones and side by side on desktop`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width,
          height: width === 874 ? 402 : 874,
        });
        await ready(page, theme === "light" ? "/?theme=light" : "/");
        await setStatusDevices(page, count, width < 901);
        await expect(page.locator(".device-chip")).toHaveCount(count);
        const boxes = await page
          .locator("ecowitt-weather-card")
          .evaluate((host) => {
            const root = host.shadowRoot!;
            const title = root
              .querySelector(".station-heading")!
              .getBoundingClientRect();
            const card = root.querySelector("ha-card")!.getBoundingClientRect();
            const statuses = [
              ...root.querySelectorAll(".header-devices .device-chip"),
            ].map((el) => {
              const r = el.getBoundingClientRect();
              return {
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
                width: el.clientWidth,
                scrollWidth: el.scrollWidth,
              };
            });
            return {
              title: {
                left: title.left,
                right: title.right,
                top: title.top,
                bottom: title.bottom,
              },
              card: { left: card.left, right: card.right },
              statuses,
            };
          });
        for (const status of boxes.statuses) {
          expect(status.left).toBeGreaterThanOrEqual(boxes.card.left);
          expect(status.right).toBeLessThanOrEqual(boxes.card.right);
          expect(status.scrollWidth).toBeLessThanOrEqual(status.width + 1);
          const overlaps =
            boxes.title.left < status.right &&
            boxes.title.right > status.left &&
            boxes.title.top < status.bottom &&
            boxes.title.bottom > status.top;
          expect(overlaps).toBe(false);
          if (width < 901)
            expect(status.top).toBeGreaterThanOrEqual(boxes.title.bottom);
        }
        for (let i = 1; i < boxes.statuses.length; i++) {
          if (width < 901)
            expect(boxes.statuses[i].top).toBeGreaterThanOrEqual(
              boxes.statuses[i - 1].bottom + 4,
            );
          else {
            expect(boxes.statuses[i].top).toBeCloseTo(boxes.statuses[0].top, 0);
            expect(boxes.statuses[i].left).toBeGreaterThan(
              boxes.statuses[i - 1].right,
            );
          }
        }
        await noOverflow(page);
      });
    }

test("device status layout follows a narrow card inside a desktop viewport", async ({
  page,
}) => {
  await ready(page);
  await page.locator("main").evaluate((el) => {
    el.style.width = "402px";
  });
  await setStatusDevices(page, 3, true);
  const boxes = await page.locator(".device-chip").evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }),
  );
  expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom);
  expect(boxes[2].top).toBeGreaterThan(boxes[1].bottom);
  await noOverflow(page);
});

test("GW3000A and WH90 registry variants preserve sources and persist explicit gateway selection", async ({
  page,
}) => {
  await ready(page, "/?editor=1");
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    const original = win.hass.callWS;
    win.editor._registryState = "idle";
    win.editor.hass = {
      ...win.hass,
      callWS: async (message: any) => {
        if (message.type === "config/device_registry/list")
          return [
            { id: "demo-ws90", name: "Beispielstation", model: "wh90" },
            { id: "demo-wh40", name: "Beispielregenmesser", model: "wh40" },
            { id: "demo-gw3000", name: "Beispielgateway", model: "GW3000A" },
            { id: "demo-wn31", name: "Beispielkanal", model: "wh31" },
          ];
        return original(message);
      },
    };
    await win.editor.updateComplete;
  });
  const editor = page.locator("ecowitt-weather-card-editor");
  await expect(editor.getByLabel("Gerät GW3000", { exact: true })).toHaveValue(
    "demo-gw3000",
  );
  await expect(editor.getByLabel("Gerät WS90", { exact: true })).toHaveValue(
    "demo-ws90",
  );
  await expect(editor.getByLabel("Gerät WN32", { exact: true })).toHaveValue(
    "",
  );
  const before = await page.evaluate(
    () => (window as DemoWindow).editor._config.entities,
  );
  await editor.getByLabel("Gerät GW3000", { exact: true }).selectOption("");
  expect(
    await page.evaluate(() => (window as DemoWindow).editor._config.entities),
  ).toEqual(before);
  expect(
    await page.evaluate(
      () => (window as DemoWindow).lastEditorConfig?.device_roles?.GW3000,
    ),
  ).toBe("");
});

test("legacy device sources remain readable once even if selected in several old and new fields", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({
      ...win.demoConfig,
      entities: {
        ...win.demoConfig.entities,
        temperature: "sensor.demo_extra",
      },
      extra_entities: ["sensor.demo_extra", "sensor.demo_missing_extra"],
      diagnostic_entities: ["sensor.demo_extra", "sensor.demo_missing_extra"],
      device_status: [
        {
          device_id: "demo-wn31",
          role: "WN31",
          name: "Beispielkanal",
          extra_entities: ["sensor.demo_extra"],
        },
      ],
    });
    await win.card.updateComplete;
  });
  await page.locator('[data-detail="sensors"]:visible').first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".device-detail")).toContainText("Beispielkanal");
  await expect(
    dialog.locator('.sensor-row[data-entity-id="sensor.demo_extra"]'),
  ).toHaveCount(1);
  await expect(
    dialog.locator('.sensor-row[data-entity-id="sensor.demo_missing_extra"]'),
  ).toHaveCount(1);
  await expect(
    dialog.locator('.sensor-row[data-entity-id="sensor.demo_missing_extra"]'),
  ).toContainText("Nicht verfügbar");
});

test("native HA media metadata supports expandable folders and images without filename extensions", async ({
  page,
}) => {
  await ready(page, "/?editor=1");
  await page.evaluate(() => {
    const win = window as DemoWindow;
    const original = win.hass.callWS;
    win.editor.hass = {
      ...win.hass,
      callWS: async (message: any) => {
        if (message.type === "media_source/browse_media")
          return message.media_content_id.endsWith("/folder")
            ? {
                children: [
                  {
                    title: "Generisches Bild ohne Dateiendung",
                    media_class: "image",
                    media_content_type: "image/svg+xml",
                    media_content_id:
                      "media-source://media_source/local/folder/image",
                  },
                ],
              }
            : {
                children: [
                  {
                    title: "Generischer Ordner",
                    can_expand: true,
                    media_content_id:
                      "media-source://media_source/local/folder",
                  },
                ],
              };
        return original(message);
      },
    };
  });
  const editor = page.locator("ecowitt-weather-card-editor");
  await editor
    .locator("summary")
    .filter({ hasText: "Private Bildquelle" })
    .click();
  await editor
    .getByRole("button", { name: "Bild aus Home Assistant Medien auswählen …" })
    .click();
  await editor.getByRole("button", { name: "📁 Generischer Ordner" }).click();
  await editor
    .getByRole("button", { name: "🖼️ Generisches Bild ohne Dateiendung" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as DemoWindow).lastEditorConfig?.site_image),
    )
    .toBe("media-source://media_source/local/folder/image");
});

test("six main metrics form three complete rows in mobile portrait", async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await ready(page);
  const boxes = await page.locator(".metrics .metric").evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, width: r.width };
    }),
  );
  expect(boxes).toHaveLength(6);
  for (let row = 0; row < 3; row++) {
    const [left, right] = boxes.slice(row * 2, row * 2 + 2);
    expect(left.top).toBeCloseTo(right.top, 0);
    expect(right.left).toBeGreaterThan(left.right);
    expect(left.width).toBeCloseTo(right.width, 0);
    if (row > 0) expect(left.top).toBeGreaterThan(boxes[(row - 1) * 2].top);
  }
});

test("mobile touch emulation can tap stacked device statuses and weather details in both orientations", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  try {
    const page = await context.newPage();
    for (const viewport of [
      { width: 402, height: 874 },
      { width: 874, height: 402 },
    ]) {
      await page.setViewportSize(viewport);
      await ready(page);
      await setStatusDevices(page, 3);
      await page.locator(".device-chip").nth(1).tap();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog")).toContainText("WH40");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Schließen" })
        .tap();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      for (const detail of ["wind", "rain", "sun"]) {
        await page.locator(`[data-detail="${detail}"]:visible`).first().tap();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Schließen" })
          .tap();
        await expect(page.getByRole("dialog")).not.toBeVisible();
      }
    }
  } finally {
    await context.close();
  }
});

test("mobile modal close stays clear of system bar in every detail view", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  try {
    const page = await context.newPage();
    await withNativeHaCard(page);
    for (const view of ["panel", "sections"]) {
      for (const viewport of [
        { width: 402, height: 874 },
        { width: 320, height: 700 },
      ]) {
        await page.setViewportSize(viewport);
        await ready(page, `/?view=${view}`);
        for (const detail of [
          "wind",
          "rain",
          "temperature",
          "pressure",
          "sun",
          "sensors",
        ]) {
          await page.locator(`[data-detail="${detail}"]:visible`).first().tap();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          const bounds = await dialog.evaluate((element) => {
            const frame = element.getBoundingClientRect();
            const close = element.querySelector<HTMLButtonElement>(".close")!
              .getBoundingClientRect();
            const content = element.querySelector(".detail-content")!
              .getBoundingClientRect();
            return {
              position: getComputedStyle(element).position,
              dialogTop: frame.top,
              dialogBottom: frame.bottom,
              closeTop: close.top,
              closeBottom: close.bottom,
              closeWidth: close.width,
              closeHeight: close.height,
              contentTop: content.top,
            };
          });
          expect(bounds.position).toBe("fixed");
          expect(bounds.dialogTop).toBeGreaterThanOrEqual(71);
          expect(bounds.dialogBottom).toBeLessThanOrEqual(viewport.height - 7);
          expect(bounds.closeTop).toBeGreaterThanOrEqual(95);
          expect(bounds.closeWidth).toBeGreaterThanOrEqual(44);
          expect(bounds.closeHeight).toBeGreaterThanOrEqual(44);
          expect(bounds.contentTop).toBeGreaterThan(bounds.closeBottom);
          await dialog.locator(".detail-content").evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          await dialog.getByRole("button", { name: "Schließen" }).tap();
          await expect(dialog).not.toBeVisible();
        }
      }
    }
  } finally {
    await context.close();
  }
});

test("Companion App detail dismissal has a fallback and preserves standalone browser behavior", async ({
  browser,
}) => {
  const companionUserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Home Assistant/2026.11.0 (iOS) Mobile/HomeAssistant, like Safari";
  const safariUserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1";
  for (const companion of [true, false]) {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
      viewport: { width: 402, height: 874 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      userAgent: companion ? companionUserAgent : safariUserAgent,
    });
    try {
      const page = await context.newPage();
      await withNativeHaCard(page);
      for (const view of ["panel", "sections"]) {
        await ready(page, `/?view=${view}`);
        for (const detail of [
          "wind",
          "rain",
          "temperature",
          "pressure",
          "sun",
          "sensors",
        ]) {
          await page.locator(`[data-detail="${detail}"]:visible`).first().tap();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          const className = await dialog.getAttribute("class");
          const headerPadding = await dialog.locator(".dialog-head").evaluate(
            (el) => parseFloat(getComputedStyle(el).paddingTop),
          );
          if (companion) {
            expect(className).toContain("ios-companion");
            await expect(page.locator(".companion-overlay")).toBeVisible();
            const panel = await dialog.boundingBox();
            const close = await dialog.locator(".close").boundingBox();
            expect(panel!.y).toBeGreaterThanOrEqual(71);
            expect(close!.y).toBeGreaterThanOrEqual(80);
            expect(headerPadding).toBeGreaterThanOrEqual(12);
            const backup = dialog.locator(".companion-dialog-dismiss");
            await expect(backup).toBeVisible();
            const bounds = await backup.boundingBox();
            expect(bounds).not.toBeNull();
            expect(bounds!.height).toBeGreaterThanOrEqual(44);
            expect(bounds!.y).toBeGreaterThan(160);
            await backup.tap();
          } else {
            expect(className).not.toContain("ios-companion");
            expect(headerPadding).toBe(24);
            await expect(dialog.locator(".companion-dialog-footer")).toHaveCount(0);
            await dialog.getByRole("button", { name: "Schließen" }).tap();
          }
          await expect(dialog).not.toBeVisible();
        }
      }
    } finally {
      await context.close();
    }
  }
});

test("Companion App overlay stays anchored when Recorder content grows", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Home Assistant/2026.11.0 (iOS) Mobile/HomeAssistant, like Safari",
  });
  try {
    const page = await context.newPage();
    await withNativeHaCard(page);
    for (const view of ["panel", "sections"]) {
      await ready(page, `/?view=${view}`);
      for (const detail of ["wind", "rain", "temperature", "pressure", "sun", "sensors"]) {
        await page.locator(`[data-detail="${detail}"]:visible`).first().tap();
        const overlay = page.locator(".companion-overlay");
        const dialog = page.getByRole("dialog");
        await expect(overlay).toBeVisible();
        expect(await overlay.evaluate(el => el.matches(":popover-open"))).toBe(true);
        await expect(dialog).toBeVisible();
        const measure = () => dialog.evaluate(el => {
          const frame = el.getBoundingClientRect();
          const close = el.querySelector<HTMLButtonElement>(".close")!.getBoundingClientRect();
          return { top: frame.top, bottom: frame.bottom, closeTop: close.top };
        });
        const before = await measure();
        expect(before.top).toBeGreaterThanOrEqual(71);
        expect(before.closeTop).toBeGreaterThanOrEqual(80);
        expect(before.bottom).toBeLessThanOrEqual(862);
        if (detail !== "sensors")
          await expect(dialog.getByText("Recorder-Verlauf wird geladen …")).toHaveCount(0);
        const after = await measure();
        expect(after.top).toBeCloseTo(before.top, 0);
        expect(after.bottom).toBeCloseTo(before.bottom, 0);
        await dialog.locator(".detail-content").evaluate(el => { el.scrollTop = el.scrollHeight; });
        await dialog.getByRole("button", { name: "Schließen" }).first().tap();
        await expect(dialog).not.toBeVisible();
        await expect(overlay).not.toBeVisible();
      }
    }
  } finally {
    await context.close();
  }
});

test("Companion App overlay closes on Escape and backdrop tap", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Home Assistant/2026.11.0 (iOS) Mobile/HomeAssistant, like Safari",
  });
  try {
    const page = await context.newPage();
    await ready(page);
    const trigger = page.locator('[data-detail="temperature"]:visible').first();
    await trigger.tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".close")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.tap();
    await expect(dialog).toBeVisible();
    await page.locator(".companion-overlay").tap({ position: { x: 2, y: 2 } });
    await expect(dialog).not.toBeVisible();
  } finally {
    await context.close();
  }
});

test("320px metrics contain long German labels with wider fallback fonts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 874 });
  await ready(page);
  for (const font of ["monospace", "Arial"]) {
    await page.locator("ecowitt-weather-card").evaluate((el, font) => {
      (el as HTMLElement).style.setProperty(
        "--paper-font-body1_-_font-family",
        font,
      );
    }, font);
    await noOverflow(page);
    const contents = await page.locator(".metric").evaluateAll((nodes) =>
      nodes.map((node) => {
        const metric = node.getBoundingClientRect();
        const content = node.querySelector("div")!.getBoundingClientRect();
        const label = node.querySelector(".label")!.getBoundingClientRect();
        return {
          left: metric.left,
          right: metric.right,
          contentLeft: content.left,
          contentRight: content.right,
          labelLeft: label.left,
          labelRight: label.right,
        };
      }),
    );
    for (const content of contents) {
      expect(content.contentLeft).toBeGreaterThanOrEqual(content.left);
      expect(content.contentRight).toBeLessThanOrEqual(content.right);
      expect(content.labelLeft).toBeGreaterThanOrEqual(content.left);
      expect(content.labelRight).toBeLessThanOrEqual(content.right);
    }
  }
});

async function withNativeHaCard(page: Page) {
  await page.addInitScript(() => {
    if (customElements.get("ha-card")) return;
    // Relevant host/slot behavior from Home Assistant's native ha-card.ts.
    // This is a local component harness, not a complete HA/Safari installation.
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        header?: string;
        constructor() {
          super();
          this.attachShadow({ mode: "open" }).innerHTML = `<style>
          :host { display:block;position:relative;box-sizing:border-box;
            background:var(--ha-card-background,var(--card-background-color,white));
            border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--divider-color,#e0e0e0));
            border-radius:var(--ha-card-border-radius,12px);color:var(--primary-text-color);
            transition:all .3s ease-out; }
          ::slotted(.card-header) { display:block;padding:20px 16px 24px;font-size:24px; }
          ::slotted(.card-content) { padding:16px; }
          ::slotted(.card-actions) { border-top:1px solid var(--divider-color,#e8e8e8);padding:8px; }
        </style><slot></slot>`;
        }
      },
    );
  });
}

test("header actions stay accessible without moving desktop weather panels", async ({ page }) => {
  await withNativeHaCard(page);
  for (const width of [874, 1024, 1120, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    await ready(page);
    await setStatusDevices(page, 5);
    const layout = await page.locator("ecowitt-weather-card").evaluate((host) => {
      const root = host.shadowRoot!;
      const box = (selector: string) => {
        const r = root.querySelector(selector)!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const devices = [...root.querySelectorAll(".device-chip")].map(el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          scrollOverflow: (el as HTMLElement).scrollWidth - (el as HTMLElement).clientWidth };
      });
      return {
        card: box("ha-card"), title: box(".station-heading"),
        records: box(".records-trigger"), diagnosis: box(".diagnostics"),
        climate: box(".weather > .climate"), mainLayout: box(".main-layout"),
        devices,
        absoluteActions: getComputedStyle(root.querySelector(".header-actions")!).position === "absolute",
      };
    });
    expect(layout.devices).toHaveLength(5);
    for (const chip of layout.devices) {
      expect(chip.left).toBeGreaterThanOrEqual(layout.card.left - 1);
      expect(chip.right).toBeLessThanOrEqual(layout.card.right + 1);
      expect(chip.scrollOverflow).toBeLessThanOrEqual(1);
    }
    for (const action of [layout.records, layout.diagnosis]) {
      expect(action.right).toBeLessThanOrEqual(layout.card.right);
      expect(action.left).toBeGreaterThanOrEqual(layout.card.left);
      expect(action.bottom - action.top).toBeGreaterThanOrEqual(44);
      expect(action.top).toBeLessThan(layout.climate.top);
    }
    expect(layout.records.right).toBeLessThan(layout.diagnosis.left);
    if (width >= 1280) expect(layout.absoluteActions).toBe(true);
    if (width <= 1024) expect(layout.absoluteActions).toBe(false);
    if (layout.absoluteActions) {
      const lastStatusBottom = Math.max(...layout.devices.map(el => el.bottom));
      expect(layout.records.top).toBeGreaterThanOrEqual(lastStatusBottom);
      expect(layout.records.bottom).toBeLessThanOrEqual(layout.climate.top);
      expect(layout.diagnosis.bottom).toBeLessThanOrEqual(layout.climate.top);
      expect(layout.records.top).toBeGreaterThan(layout.title.top);
    } else {
      // At medium desktop widths there is no 44px gap after the second
      // status row: actions stay in the heading rather than covering panels.
      expect(layout.records.bottom).toBeLessThanOrEqual(layout.devices[0].top);
    }
    await noOverflow(page);
  }
});

test("mobile status bars move after all weather content and action buttons stay in the first row", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await withNativeHaCard(page);
    for (const width of [320, 402, 600]) {
    await page.setViewportSize({ width, height: 874 });
    await ready(page);
    await setStatusDevices(page, 5);
    const layout = await page.locator("ecowitt-weather-card").evaluate((host) => {
      const root = host.shadowRoot!;
      const box = (selector: string) => {
        const r = root.querySelector(selector)!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const devices = [...root.querySelectorAll(".header-devices .device-chip")].map(el => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
      return {
        heading: box(".station-heading"), records: box(".records-trigger"),
        diagnosis: box(".diagnostics"), summary: box(".mobile-summary"),
        metrics: box(".metrics"), footer: box(".footer"),
        status: box(".header-devices"), devices, card: box("ha-card"),
      };
    });
    expect(layout.devices).toHaveLength(5);
    expect(layout.records.top).toBeLessThan(layout.summary.top);
    expect(layout.diagnosis.top).toBeLessThan(layout.summary.top);
    expect(Math.abs(layout.records.top - layout.heading.top)).toBeLessThan(15);
    expect(Math.abs(layout.records.top - layout.diagnosis.top)).toBeLessThan(1);
    expect(layout.status.top).toBeGreaterThanOrEqual(layout.metrics.bottom);
    expect(layout.status.top).toBeGreaterThanOrEqual(layout.footer.bottom);
    expect(layout.status.bottom).toBeLessThanOrEqual(layout.card.bottom);
    for (let i = 1; i < layout.devices.length; i++) {
      expect(layout.devices[i].top).toBeGreaterThan(layout.devices[i - 1].bottom);
    }
    await noOverflow(page);
    await page.getByRole("button", { name: "Wetterrekorde öffnen" }).tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Schließen" }).first().tap();
    await page.getByRole("button", { name: "Sensoren und Diagnosen öffnen" }).tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Schließen" }).first().tap();
    }
  } finally {
    await context.close();
  }
});

test("native HA card keeps a full title and single-line device chips at real card widths", async ({
  page,
}) => {
  await withNativeHaCard(page);
  for (const width of [320, 402, 874, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 874 ? 402 : 874 });
    await ready(page);
    await setStatusDevices(page, 3, true);
    await expect(page.locator("ha-card")).toHaveCSS("position", "relative");
    await expect(page.locator(".device-chip > strong")).toHaveText([
      "WS90",
      "WH40",
      "WN31",
    ]);
    const layout = await page.locator(".station-header").evaluate((header) => {
      const root = header.getBoundingClientRect();
      const heading = header
        .querySelector(".station-heading")!
        .getBoundingClientRect();
      const title = header.querySelector("h1")!.getBoundingClientRect();
      const font = parseFloat(
        getComputedStyle(header.querySelector("h1")!).fontSize,
      );
      const chips = [...header.querySelectorAll(".device-chip")].map((chip) => {
        const rect = chip.getBoundingClientRect();
        const centers = [...chip.children].map((child) => {
          const box = child.getBoundingClientRect();
          return (box.top + box.bottom) / 2;
        });
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          centers,
          overflow: chip.scrollWidth - chip.clientWidth,
        };
      });
      return {
        headerHeight: root.height,
        headingWidth: heading.width,
        titleBottom: title.bottom,
        titleHeight: title.height,
        font,
        chips,
      };
    });
    expect(layout.headingWidth).toBeGreaterThanOrEqual(140);
    expect(layout.titleHeight).toBeLessThan(layout.font * 5);
    expect(layout.headerHeight).toBeLessThan(300);
    for (const chip of layout.chips) {
      expect(chip.height).toBeLessThanOrEqual(46);
      expect(chip.overflow).toBeLessThanOrEqual(1);
      expect(
        Math.max(...chip.centers) - Math.min(...chip.centers),
      ).toBeLessThan(1);
      if (width <= 900) expect(chip.top).toBeGreaterThan(layout.titleBottom);
    }
    if (width <= 900)
      for (let i = 1; i < layout.chips.length; i++)
        expect(layout.chips[i].top).toBeGreaterThan(layout.chips[i - 1].bottom);
    else
      for (let i = 1; i < layout.chips.length; i++) {
        expect(layout.chips[i].top).toBeCloseTo(layout.chips[0].top, 0);
        expect(layout.chips[i].left).toBeGreaterThan(layout.chips[i - 1].right);
      }
    await noOverflow(page);
  }
});

test("header fallback stays mobile-safe when container-query rules are ignored", async ({
  page,
}) => {
  await withNativeHaCard(page);
  await page.setViewportSize({ width: 402, height: 874 });
  await ready(page);
  await setStatusDevices(page, 3, true);
  await page.locator("ecowitt-weather-card").evaluate((card) => {
    const sheet = new CSSStyleSheet();
    const rules = card.shadowRoot!.adoptedStyleSheets.flatMap((style) => [
      ...style.cssRules,
    ]);
    sheet.replaceSync(
      rules
        .filter((rule) => rule.constructor.name !== "CSSContainerRule")
        .map((rule) => rule.cssText)
        .join("\n"),
    );
    card.shadowRoot!.adoptedStyleSheets = [sheet];
  });
  const heading = await page.locator(".station-heading").boundingBox();
  expect(heading!.width).toBeGreaterThan(200);
  const chips = await page.locator(".device-chip").evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }),
  );
  expect(chips[0].top).toBeGreaterThan(heading!.y + heading!.height);
  expect(chips[1].top).toBeGreaterThan(chips[0].bottom);
  expect(chips[2].top).toBeGreaterThan(chips[1].bottom);
});

test("compass restores pre-PR5 circle size while degree labels follow exact cardinal axes", async ({
  page,
}) => {
  await withNativeHaCard(page);
  for (const [width, expected] of [
    [402, 324],
    [1440, 564],
  ]) {
    await page.setViewportSize({ width, height: 874 });
    await ready(page);
    const circle = await page.locator(".site").boundingBox();
    expect(circle!.width).toBeCloseTo(expected, 0);
    const errors = await page.locator(".site").evaluate((site) => {
      const circle = site.getBoundingClientRect(),
        cx = (circle.left + circle.right) / 2,
        cy = (circle.top + circle.bottom) / 2;
      return [
        ...site.querySelectorAll<HTMLElement>(".degree-ring [data-degrees]"),
      ].map((label) => {
        const box = label.getBoundingClientRect(),
          x = (box.left + box.right) / 2 - cx,
          y = (box.top + box.bottom) / 2 - cy;
        const actual = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360,
          expected = Number(label.dataset.degrees);
        return Math.min(
          Math.abs(actual - expected),
          360 - Math.abs(actual - expected),
        );
      });
    });
    expect(Math.max(...errors)).toBeLessThan(0.05);
    await expect(page.locator(".degree-ring [data-degrees]").first()).toHaveCSS(
      "font-size",
      "9px",
    );
  }
});

for (const portrait of [true, false])
  for (const theme of ["light", "dark"]) {
    test(`native HA ${portrait ? "portrait" : "landscape"} ${theme}: every detail ends at its content and contains scrolling`, async ({
      page,
    }) => {
      await withNativeHaCard(page);
      await page.setViewportSize({
        width: portrait ? 402 : 874,
        height: portrait ? 874 : 402,
      });
      await ready(page, theme === "light" ? "/?theme=light" : "/");
      for (const detail of [
        "wind",
        "rain",
        "temperature",
        "pressure",
        "sun",
        "sensors",
      ]) {
        await page.locator(`[data-detail="${detail}"]:visible`).first().click();
        const dialog = page.getByRole("dialog"),
          scroller = dialog.locator(".detail-content");
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByText("Recorder-Verlauf wird geladen …"),
        ).toHaveCount(0);
        const end = await scroller.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
          const last = el.lastElementChild!.getBoundingClientRect(),
            box = el.getBoundingClientRect();
          return {
            gap: box.bottom - last.bottom,
            max: el.scrollHeight - el.clientHeight,
            top: el.scrollTop,
            overflow: el.scrollWidth - el.clientWidth,
          };
        });
        expect(end.top).toBeCloseTo(end.max, 0);
        expect(end.gap).toBeGreaterThanOrEqual(-1);
        expect(end.gap).toBeLessThanOrEqual(21);
        expect(end.overflow).toBeLessThanOrEqual(1);
        const pageY = await page.evaluate(() => window.scrollY);
        await scroller.hover();
        await page.mouse.wheel(0, 900);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
        await dialog.getByRole("button", { name: "Schließen" }).click();
        await expect(dialog).not.toBeVisible();
      }
    });
  }

test("wet status droplet permits its edge stroke outside the SVG viewport", async ({
  page,
}) => {
  await ready(page);
  const icon = page.locator(".rain .wet-badge .icon");
  await expect(icon).toHaveCSS("overflow", "visible");
  const edge = await icon.evaluate((node) => {
    const svg = node as SVGSVGElement,
      path = svg.querySelector("path")!;
    const box = path.getBBox(),
      stroke = parseFloat(getComputedStyle(path).strokeWidth);
    return box.y + box.height + stroke / 2 > svg.viewBox.baseVal.height;
  });
  expect(edge).toBe(true);
});

test("manual alternate gateway persists across a recreated editor and delayed HA registry", async ({
  page,
}) => {
  await ready(page, "/?editor=1");
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    const original = win.hass.callWS;
    const states = {
      ...win.hass.states,
      "sensor.demo_alternate_pressure": {
        entity_id: "sensor.demo_alternate_pressure",
        state: "1010",
        last_updated: new Date().toISOString(),
        attributes: {
          friendly_name: "Relativer Luftdruck · Alternativ",
          unit_of_measurement: "hPa",
          device_class: "atmospheric_pressure",
        },
      },
    };
    win.hass = {
      ...win.hass,
      states,
      callWS: async (message: any) => {
        if (message.type === "config/device_registry/list")
          return [
            {
              id: "demo-gw3000",
              name: "Automatisches Beispielgateway",
              model: "GW3000A",
            },
            {
              id: "demo-alternate",
              name: "Manuelles Beispielgateway",
              model: "Gateway",
            },
          ];
        if (message.type === "config/entity_registry/list")
          return [
            {
              entity_id: "sensor.demo_pressure",
              device_id: "demo-gw3000",
              disabled_by: null,
            },
            {
              entity_id: "sensor.demo_alternate_pressure",
              device_id: "demo-alternate",
              disabled_by: null,
            },
          ];
        return original(message);
      },
    };
    win.editor._registryState = "idle";
    win.editor.hass = win.hass;
    await win.editor.updateComplete;
  });
  const editor = page.locator("ecowitt-weather-card-editor");
  await editor
    .getByLabel("Gerät GW3000", { exact: true })
    .selectOption("demo-alternate");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as DemoWindow).lastEditorConfig?.device_roles?.GW3000,
      ),
    )
    .toBe("demo-alternate");
  expect(
    await page.evaluate(
      () => (window as DemoWindow).lastEditorConfig?.entities?.pressure,
    ),
  ).toBe("sensor.demo_pressure");
  await page.evaluate(async () => {
    const win = window as DemoWindow,
      saved = win.lastEditorConfig;
    const Editor = customElements.get("ecowitt-weather-card") as any;
    const replacement = await Editor.getConfigElement();
    const host = document.querySelector("#editor")!;
    win.editor.remove();
    host.append(replacement);
    win.editor = replacement;
    replacement.setConfig(saved);
    const original = win.hass.callWS;
    replacement.hass = {
      ...win.hass,
      callWS: async (message: any) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return original(message);
      },
    };
    await replacement.updateComplete;
  });
  const recreated = page.locator("ecowitt-weather-card-editor");
  await expect(
    recreated.getByLabel("Gerät GW3000", { exact: true }),
  ).toHaveValue("demo-alternate");
  await recreated.getByText("Druck & Sonne", { exact: true }).click();
  const pressure = recreated.locator('[data-metric="pressure"]');
  await expect(pressure.locator(".suggestion")).toContainText(
    "Relativer Luftdruck · Alternativ",
  );
  await expect(pressure.locator(".suggestion")).not.toContainText(
    "Relativer Luftdruck GW3000",
  );
});

test("rain trajectories and ground splashes animate within the original image without intercepting taps", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 402, height: 874 });
  await ready(page);
  const scene = page.locator(".site .weather-scene");
  await expect(scene).toHaveCSS("pointer-events", "none");
  await expect(scene).toHaveCSS("border-radius", "50%");
  await expect(page.locator(".site .scene-splash").first()).toHaveCSS(
    "animation-name",
    "weather-ground-splash",
  );
  const sample = () =>
    page
      .locator(".site .scene-drop-track")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().y),
      );
  const before = await sample();
  await page.waitForTimeout(250);
  const after = await sample();
  expect(after.some((y, i) => Math.abs(y - before[i]) > 5)).toBe(true);
  const circle = await page.locator(".site").boundingBox();
  expect(circle?.width).toBeCloseTo(324, 0);
  await update(page, "rain_rate", 0, "mm/h");
  await setSky(page, 45, 700);
  const sunCircle = await page.locator(".site").boundingBox();
  expect(sunCircle?.width).toBe(circle?.width);
  await expect(page.locator(".site .scene-sun")).toBeVisible();
  await page.locator(".site").click();
  await expect(page.locator(".wind-stage")).toHaveClass(/is-flipped/);
  await expect(page.locator("ecowitt-windrose-host")).toContainText(
    "HACS-Ressource",
  );
  await page.getByRole("button", { name: "Windgrafik", exact: true }).click();
  await expect(page.locator(".wind-stage")).not.toHaveClass(/is-flipped/);
  await page.waitForTimeout(700);
  await expect(page.locator(".site")).toBeFocused();
  await noOverflow(page);
});

test("unchanged valid rain does not silently expire; explicit age and real secondary rate are honored", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow,
      id = win.demoConfig.entities.rain_rate;
    win.hass.states[id] = {
      ...win.hass.states[id],
      last_updated: new Date(Date.now() - 2 * 3600_000).toISOString(),
    };
    win.setDemoConfig({ ...win.demoConfig, stale_after_minutes: 0 });
    await win.card.updateComplete;
  });
  await expect(page.locator(".site .scene-drop-track")).toHaveCount(24);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({ ...win.demoConfig, stale_after_minutes: 5 });
    await win.card.updateComplete;
  });
  await expect(page.locator(".site .scene-drop-track")).toHaveCount(0);
  await page.evaluate(async () => {
    const win = window as DemoWindow,
      id = "sensor.demo_secondary_rate";
    win.hass.states[id] = {
      entity_id: id,
      state: "3",
      last_updated: new Date().toISOString(),
      attributes: {
        friendly_name: "Piezo Regenrate",
        unit_of_measurement: "mm/h",
      },
    };
    win.setDemoConfig({
      ...win.demoConfig,
      entities: { ...win.demoConfig.entities, rain_rate_secondary: id },
      stale_after_minutes: 5,
    });
    await win.card.updateComplete;
  });
  await expect(page.locator(".site .scene-drop-track")).toHaveCount(34);
  await page.locator(".weather-info summary").click();
  await expect(page.locator(".weather-info p")).toContainText("WS90");
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "NASS",
  );
});

test("optional real HA weather selection and installed windrose preferences survive visual edits", async ({
  page,
}) => {
  await ready(page, "/?editor=1");
  await page.evaluate(async () => {
    const win = window as DemoWindow,
      id = "weather.demo_local";
    win.hass.states[id] = {
      entity_id: id,
      state: "sunny",
      attributes: { friendly_name: "Lokale Wetterquelle" },
      last_updated: new Date().toISOString(),
    };
    win.editor.hass = { ...win.hass };
    await win.editor.updateComplete;
  });
  await page
    .getByText("Darstellung, Wetteranimation und Theme", { exact: true })
    .click();
  await page
    .getByLabel("Optionale HA-Wetterquelle", { exact: true })
    .selectOption("weather.demo_local");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as DemoWindow).lastEditorConfig.weather_entity,
      ),
    )
    .toBe("weather.demo_local");
  await update(page, "rain_rate", 0, "mm/h");
  await expect(page.locator(".site .weather-scene")).toHaveAttribute(
    "data-scene-weather",
    "sunny",
  );
  await page.getByText("Eingebettete Windrose", { exact: true }).click();
  await page
    .getByLabel("Windrose beim Tippen auf die Windgrafik", { exact: true })
    .uncheck();
  await expect(page.locator(".site")).toHaveAttribute("role", "img");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as DemoWindow).lastEditorConfig.windrose.enabled,
      ),
    )
    .toBe(false);
  await expect(page.locator(".rose-toggle")).toHaveCount(0);
});


test("outdoor climate shows HA-local Recorder extrema next to the unchanged current temperature", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-15T15:00:00Z") });
  await page.setViewportSize({ width: 402, height: 874 });
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.historyRequests = [];
    win.hass.callApi = async (method: string, path: string) => {
      win.historyRequests.push({ method, path });
      return [[...[-1, 1, 4, 9].map((hours, i) => ({
        entity_id: "sensor.demo_temperature",
        state: String([7, 3, 12, 8][i]),
        attributes: { unit_of_measurement: "°C" },
        last_updated: new Date(Date.parse("2026-11-14T23:00:00Z") + hours * 3600_000).toISOString(),
      }))]];
    };
    const { temperature_min, temperature_max, ...entities } = win.demoConfig.entities;
    win.setDemoConfig({ ...win.demoConfig, entities });
    await win.card.updateComplete;
  });
  const climate = page.locator(".climate");
  await expect(climate.locator(".climate-current-value")).toContainText("18,6");
  const maximum = climate.locator(".climate-extreme.maximum");
  const minimum = climate.locator(".climate-extreme.minimum");
  await expect(maximum).toHaveAttribute("data-source", "recorder");
  await expect(minimum).toHaveAttribute("data-source", "recorder");
  await expect(maximum).toContainText("12,0");
  await expect(minimum).toContainText("3,0");
  await expect.poll(async () => page.evaluate(() => (window as DemoWindow).historyRequests.length)).toBe(1);
  await update(page, "wind_speed", 3);
  await expect.poll(async () => page.evaluate(() => (window as DemoWindow).historyRequests.length)).toBe(1);
  await expect(climate.locator(".trio > div")).toHaveCount(3);
  await expect(climate.locator('[data-key="humidity"]')).toContainText("76");
  await expect(climate.locator('[data-key="feels_like"]')).toContainText("18,1");
  const bounds = await climate.locator('[data-key="temperature"]').evaluate((el) => {
    const current = el.querySelector(".climate-current-value")!.getBoundingClientRect();
    const extrema = el.querySelector(".climate-extremes")!.getBoundingClientRect();
    return { right: current.right, left: extrema.left, deltaY: Math.abs(current.y + current.height / 2 - extrema.y - extrema.height / 2) };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.right - 1);
  expect(bounds.deltaY).toBeLessThan(14);
  await noOverflow(page);
});

test("day extrema are slightly larger without overlapping the main temperature on phone and desktop", async ({ page }) => {
  for (const width of [320, 402, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    const climate = page.locator(".climate");
    const extrema = climate.locator(".climate-extreme");
    await expect(extrema).toHaveCount(2);
    const sizes = await extrema.evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
    expect(sizes.every((value) => value >= 10)).toBe(true);
    const bounds = await climate.locator('[data-key="temperature"]').evaluate((el) => {
      const current = el.querySelector(".climate-current-value")!.getBoundingClientRect();
      const max = el.querySelector(".climate-extreme.maximum")!.getBoundingClientRect();
      const min = el.querySelector(".climate-extreme.minimum")!.getBoundingClientRect();
      const cell = el.getBoundingClientRect();
      return { nonoverlap: max.left >= current.right - 1, vertical: min.top >= max.bottom - 1, fits: Math.max(max.right,min.right) <= cell.right + 1 };
    });
    expect(bounds.nonoverlap).toBe(true);
    expect(bounds.vertical).toBe(true);
    expect(bounds.fits).toBe(true);
    await noOverflow(page);
  }
});

test("explicitly configured minimum and maximum take priority and require no Recorder history", async ({ page }) => {
  await ready(page);
  const climate = page.locator(".climate");
  const maximum = climate.locator(".climate-extreme.maximum");
  const minimum = climate.locator(".climate-extreme.minimum");
  await expect(maximum).toHaveAttribute("data-source", "entity");
  await expect(minimum).toHaveAttribute("data-source", "entity");
  await expect(maximum).toContainText("20,3");
  await expect(minimum).toContainText("12,7");
  const history = await page.evaluate(() => (window as DemoWindow).historyRequests);
  expect(history).toHaveLength(0);
  await noOverflow(page);
});

test("details identify actual source devices, show both axes, and derive extrema from the HA calendar day", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-15T15:00:00Z") });
  await page.setViewportSize({ width: 402, height: 874 });
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow,
      original = win.hass.callWS;
    win.hass.states["sensor.demo_temperature"].attributes.friendly_name =
      "Außentemperatur";
    win.hass.callWS = async (message: any) => {
      const result = await original(message);
      return message.type === "config/entity_registry/list"
        ? result.map((entry: any) =>
            entry.entity_id === "sensor.demo_temperature"
              ? { ...entry, device_id: "demo-ws90" }
              : entry,
          )
        : result;
    };
    const { temperature_min, temperature_max, ...entities } =
      win.demoConfig.entities;
    win.hass.callApi = async (method: string, path: string) => {
      win.historyRequests.push({ method, path });
      return [
        [
          ...[-1, 1, 4, 9].map((hours, i) => ({
            entity_id: "sensor.demo_temperature",
            state: String([7, 3, 12, 8][i]),
            attributes: { unit_of_measurement: "°C" },
            last_updated: new Date(
              Date.parse("2026-11-14T23:00:00Z") + hours * 3600_000,
            ).toISOString(),
          })),
        ],
      ];
    };
    win.setDemoConfig({ ...win.demoConfig, entities });
    await win.card.updateComplete;
  });
  await page.locator('[data-detail="temperature"]:visible').first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.locator('.detail-reading[data-key="temperature"] .label'),
  ).toHaveText("Außentemperatur · WS90");
  await expect(dialog).not.toContainText("sensor.demo_");
  await expect(dialog.locator('[data-key="temperature_min"]')).toContainText(
    "3",
  );
  await expect(dialog.locator('[data-key="temperature_max"]')).toContainText(
    "12",
  );
  await expect(dialog.locator(".daily-coverage")).toContainText(
    "2026-11-15 · Europe/Berlin",
  );
  await expect(dialog.locator(".plot-values").first()).toContainText("12");
  await expect(dialog.locator(".plot-unit").first()).toHaveText("°C");
  await expect(
    dialog.locator(".plot-times").first().locator("time"),
  ).toHaveCount(3);
  await expect(dialog.locator(".plot-zone").first()).toContainText(
    "Europe/Berlin",
  );
  const requests = await page.evaluate(
    () => (window as DemoWindow).historyRequests,
  );
  const daily = requests.find((request) =>
    request.path.startsWith("history/period/2026-11-14T23:00:00.000Z"),
  );
  expect(daily).toBeTruthy();
  expect(
    new URL(daily.path, "http://fixture").searchParams.get("filter_entity_id"),
  ).toBe("sensor.demo_temperature");
  await page.clock.runFor(50);
  await dialog
    .locator(".detail-content")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  const endGap = await dialog
    .locator(".detail-content")
    .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  expect(endGap).toBeLessThanOrEqual(1);
});


test("embedded windrose automatically receives the gust source and selector buttons while preserving the host period dropdown", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    class SyntheticWindrose extends HTMLElement {
      config: any;
      setConfig(config: any) {
        this.config = config;
      }
      set hass(_value: unknown) {}
    }
    if (!customElements.get("windrose-card"))
      customElements.define("windrose-card", SyntheticWindrose);
    const win = window as DemoWindow;
    win.setDemoConfig({
      ...win.demoConfig,
      windrose: {
        enabled: true,
        config: {
          hide_windspeed_bar: false,
          rose_config: { wind_direction_count: 16 },
        },
        variants: [
          { title: "24 Stunden", config: { data_period: { period_back: "-24h" } } },
          { title: "60 Tage", config: { data_period: { period_back: "-60d" } } },
        ],
      },
    });
    await win.card.updateComplete;
  });
  await page.locator(".site").click();
  const getNativeConfig = () =>
    page.evaluate(() => {
      const host = (window as DemoWindow).card.shadowRoot?.querySelector("ecowitt-windrose-host");
      const card = host?.shadowRoot?.querySelector("windrose-card") as any;
      return card?.config;
    });
  await expect.poll(async () => (await getNativeConfig())?.windspeed_entities?.length).toBe(2);
  const original = await getNativeConfig();
  expect(original.windspeed_entities.map((source: any) => source.entity)).toEqual([
    "sensor.demo_wind_speed",
    "sensor.demo_wind_gust",
  ]);
  expect(original.buttons_config).toBeUndefined();
  await expect(page.locator("ecowitt-windrose-host").locator(".speed-mode button")).toHaveCount(2);
  expect(original.corner_info.top_right.entity).toBe("sensor.demo_wind_speed");
  expect(original.windspeed_entities[0].speed_ranges).toBeUndefined();
  expect(original.windspeed_entities[1].speed_ranges).toBeUndefined();
  await page.getByLabel("Windrosenvariante", { exact: true }).selectOption("1");
  await expect.poll(async () => (await getNativeConfig())?.data_period?.period_back).toBe("-60d");
  const later = await getNativeConfig();
  expect(later.corner_info.top_right.label).toBe("Windgeschwindigkeit");
  const host = page.locator("ecowitt-windrose-host");
  await host.locator(".speed-mode button", { hasText: "Böen" }).click();
  await expect.poll(async () => (await getNativeConfig())?.corner_info?.top_right?.label).toBe("Max. Böe heute");
  const selected = await getNativeConfig();
  expect(selected.windspeed_entities[1].use_for_windrose).toBe(true);
  expect(selected.windspeed_entities[1].entity).toBe("sensor.demo_wind_gust");
  await expect.poll(async () => (await getNativeConfig())?.data_period?.period_back).toBe("-60d");
  await host.locator(".speed-mode button", { hasText: "Windgeschwindigkeit" }).click();
  await expect.poll(async () => (await getNativeConfig())?.corner_info?.top_right?.entity).toBe("sensor.demo_wind_speed");
});

test("installed real windrose flips into the dashboard, retains instance across HA updates and stops on return", async ({
  page,
}) => {
  test.skip(
    !process.env.WINDROSE_UPSTREAM_JS,
    "Provide the locally downloaded upstream release to verify the actual installed resource.",
  );
  const upstream = await readFile(process.env.WINDROSE_UPSTREAM_JS!);
  await page.route("**/__installed_windrose.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: upstream }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 402, height: 874 });
  await ready(page);
  await page.addScriptTag({ url: "/__installed_windrose.js", type: "module" });
  await page.waitForFunction(() => customElements.get("windrose-card"));
  await page.evaluate(async () => {
    const win = window as DemoWindow,
      original = win.hass.callWS;
    (win as any).roseRequests = [];
    Object.assign(win.hass, {
      entities: {},
      connection: { connected: true },
      locale: {
        language: "de",
        number_format: "decimal_comma",
        time_format: "24",
        date_format: "DMY",
        first_weekday: "monday",
        time_zone: "server",
      },
      localize: (key: string) => key,
    });
    win.hass.callWS = async (message: any) => {
      if (message.type !== "history/history_during_period")
        return original(message);
      (win as any).roseRequests.push(message);
      const id = message.entity_ids[0],
        timestamp = Math.floor(Date.now() / 1000);
      return {
        [id]: Array.from({ length: 96 }, (_, i) => ({
          lu: timestamp - 86400 + i * 900,
          s: String(id.includes("direction") ? (i * 15) % 360 : 4 + (i % 12)),
        })),
      };
    };
    win.card.hass = win.hass;
    await win.card.updateComplete;
  });
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({
      ...win.demoConfig,
      windrose: {
        config: { hide_windspeed_bar: false },
        variants: [
          {
            title: "24 Stunden",
            config: { data_period: { period_back: "-24h" } },
          },
          {
            title: "Woche",
            config: {
              title: "Wochenwind",
              data_period: { period_back: "-7d" },
            },
          },
        ],
      },
    });
    win.card.hass = win.hass;
    await win.card.updateComplete;
  });
  const initialURL = page.url();
  await page.locator(".site").click();
  const installed = page.locator("ecowitt-windrose-host windrose-card");
  await expect(installed.locator("svg").first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).roseRequests?.length))
    .toBe(2);
  await page.evaluate(() => {
    (window as any).installedRose = (window as DemoWindow).card.shadowRoot
      .querySelector("ecowitt-windrose-host")
      .shadowRoot.querySelector("windrose-card");
  });
  // Wait for the flip to finish before checking the projected SVG width.
  await expect.poll(()=>installed.locator("svg").first().evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(200);
  const width = await installed
    .locator("svg")
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(300);
  expect(width).toBeGreaterThan(200);
  await expect
    .poll(async () => {
      const rose = await installed.locator("svg").first().boundingBox();
      const stage = await page.locator(".wind-stage").boundingBox();
      return Boolean(
        rose && stage && rose.y + rose.height <= stage.y + stage.height + 1,
      );
    })
    .toBe(true);
  await update(page, "wind_direction", 301);
  expect(
    await page.evaluate(
      () =>
        (window as any).installedRose ===
        (window as DemoWindow).card.shadowRoot
          .querySelector("ecowitt-windrose-host")
          .shadowRoot.querySelector("windrose-card"),
    ),
  ).toBe(true);
  expect(page.url()).toBe(initialURL);
  await page.getByLabel("Windrosenvariante", { exact: true }).selectOption("1");
  await expect
    .poll(() =>
      installed
        .locator("ha-card")
        .evaluate((el: any) => el.header ?? el.getAttribute("header")),
    )
    .toBe("Wochenwind");
  await expect
    .poll(() => page.evaluate(() => (window as any).roseRequests.length))
    .toBe(4);
  expect(
    await page.evaluate(() => (window as any).installedRose.updateInterval),
  ).toBeUndefined();
  await page.evaluate(() => {
    (window as any).installedRose = (window as DemoWindow).card.shadowRoot
      .querySelector("ecowitt-windrose-host")
      .shadowRoot.querySelector("windrose-card");
  });
  await page.getByRole("button", { name: "Windgrafik", exact: true }).click();
  await expect(installed).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).installedRose.updateInterval),
  ).toBeUndefined();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("wind and climate panels retain large values in three columns and two wind rows on desktop and phone", async ({
  page,
}) => {
  for (const width of [320, 402, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await ready(page);
    const wind = page.locator(".panel.wind");
    const positions = await wind
      .locator(".trio > div")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().y),
      );
    expect(new Set(positions).size).toBe(1);
    expect(positions).toHaveLength(3);
    await expect(wind.locator(".wind-minor")).toHaveCount(0);
    await expect(wind.locator(".direction-pair > div")).toHaveCount(2);
    await expect(wind.locator(".direction-compass").first()).toHaveCSS(
      "color",
      await wind
        .locator(".panel-heading .icon")
        .evaluate((el) => getComputedStyle(el).color),
    );
    await expect(page.locator(".climate .trio > div")).toHaveCount(3);
    await expect(
      page.locator('.climate [data-key="feels_like"]'),
    ).toContainText("18,1");
    await expect(wind).not.toContainText("10 Min.");
    if (width < 760) {
      await expect(
        page.locator('.mobile-summary [data-key="temperature"]'),
      ).toBeVisible();
      await expect(
        page.locator('.mobile-summary [data-key="rain_wet"]'),
      ).toBeVisible();
    }
    await noOverflow(page);
  }
});

test("maximum card width is a responsive ceiling and saves from the editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1400 });
  await ready(page, "/?editor=1");
  const editor = page.locator("ecowitt-weather-card-editor");
  await editor
    .getByText("Darstellung, Wetteranimation und Theme", { exact: true })
    .click();
  await editor
    .getByLabel("Maximale Kartenbreite", { exact: true })
    .evaluate((el) => {
      (el as HTMLInputElement).value = "2100";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await expect
    .poll(() =>
      page.evaluate(() => (window as DemoWindow).lastEditorConfig?.max_width),
    )
    .toBe(2100);
  await expect
    .poll(() =>
      page
        .locator("ha-card")
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
    )
    .toBe(2100);
  await page.setViewportSize({ width: 402, height: 874 });
  expect(
    (await page.locator("ha-card").first().boundingBox())!.width,
  ).toBeLessThanOrEqual(394);
  await noOverflow(page);
});

test("editor creates only opened sensor pickers and absolute pressure remains a distinct detail source", async ({
  page,
}) => {
  await ready(page, "/?editor=1");
  const editor = page.locator("ecowitt-weather-card-editor");
  await expect(editor.locator("ha-entity-picker")).toHaveCount(5);
  await editor.getByText("Wind", { exact: true }).click();
  await expect(editor.locator("ha-entity-picker")).toHaveCount(0);
  await editor.getByText("Druck & Sonne", { exact: true }).click();
  await expect(
    editor.locator('[data-metric="pressure_absolute"] ha-entity-picker'),
  ).toHaveCount(1);
  await page.evaluate(async () => {
    const win = window as DemoWindow,
      id = "sensor.demo_absolute_pressure";
    win.hass.states[id] = {
      entity_id: id,
      state: "997.4",
      attributes: {
        friendly_name: "Absoluter Druck",
        unit_of_measurement: "hPa",
      },
    };
    win.editor.hass = { ...win.hass };
    await win.editor.updateComplete;
  });
  await editor
    .locator('[data-metric="pressure_absolute"] select')
    .selectOption("sensor.demo_absolute_pressure");
  await expect(page.locator('.metric[data-key="pressure_absolute"]')).toContainText("997,4");
  await page.locator('.metric[data-key="pressure_absolute"]').click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('[data-key="pressure_absolute"]')).toContainText(
    "997,4",
  );
  await expect(dialog.locator('[data-key="pressure"]')).toContainText("1.012");
});

test("rain tile drops have colored visible strokes on light and dark themes with narrow animation layers", async ({
  page,
}) => {
  for (const theme of ["light", "dark"]) {
    await ready(page, theme === "light" ? "/?theme=light" : "/");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const drops = page.locator(".rain .scene-rain-drop");
    await expect(drops.first()).toBeVisible();
    const style = await drops.first().evaluate((el) => ({
      background: getComputedStyle(el).backgroundImage,
      width: el.getBoundingClientRect().width,
      track: el.parentElement!.getBoundingClientRect().width,
      opacity: getComputedStyle(el.closest(".weather-scene")!).opacity,
    }));
    expect(style.background).toContain("rgb");
    expect(style.track).toBeLessThanOrEqual(4);
    expect(Number(style.opacity)).toBeGreaterThan(0.9);
    const before = await drops.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().y),
    );
    await page.waitForTimeout(200);
    expect(
      await drops.evaluateAll(
        (nodes, before) =>
          nodes.some(
            (node, index) =>
              Math.abs(node.getBoundingClientRect().y - before[index]) > 5,
          ),
        before,
      ),
    ).toBe(true);
  }
});
