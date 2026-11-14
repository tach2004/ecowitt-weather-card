import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

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
          return (
            box.width > 0 &&
            (box.right > root.right + 2 || box.left < root.left - 2)
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
  await expect(dialog).toContainText("Beispiel Zusatzkanal WN31");
  await expect(dialog).toContainText(/21[,.]4/);
  await expect(dialog).toContainText("Beispiel Batterie WH40");
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

test("light theme, reduced motion and iPhone landscape remain usable", async ({
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
      await expect(page.locator('[data-key="pressure"]').first()).toContainText(
        "1.012",
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

test("measured WH40 rain is visualized while wet Piezo remains a separate status", async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator(".rain-atmosphere i")).toHaveCount(14);
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "rain",
  );
  await update(page, "rain_rate", 0, "mm/h");
  await update(page, "rain_wet", "on");
  await expect(page.locator(".rain-atmosphere")).toHaveCount(0);
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "unknown",
  );
  await expect(page.locator(".sky-banner")).toContainText(
    "Wetter nicht bestimmbar",
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
    await expect(page.locator(".degree-ring text")).toHaveCount(8);
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
      return [...site.querySelectorAll(".degree-ring text")].map((node) => {
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
          color: getComputedStyle(node).fill,
          stroke: getComputedStyle(node).stroke,
          textHeight: box.height,
          cardinalHeight: cardinals[0].height,
        };
      });
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

test("wet surface coexists with estimated sun and clouds, with measured rain taking priority", async ({
  page,
}) => {
  await ready(page);
  await update(page, "rain_rate", 0, "mm/h");
  await update(page, "rain_wet", "on");
  await setSky(page, 45, 700);
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "sunny",
  );
  await expect(page.locator(".sun-disc")).toHaveCount(1);
  await expect(page.locator(".sky-banner")).toContainText("geschätzt");
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "NASS",
  );
  await expect(page.locator(".rain-sun-decoration")).toHaveCount(1);
  await setSky(page, 15, 150);
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "partlycloudy",
  );
  await expect(page.locator(".sun-disc")).toHaveCount(1);
  await expect(page.locator(".cloud-one")).toHaveCount(1);
  await setSky(page, 45, 30);
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "cloudy",
  );
  await expect(page.locator(".sun-disc")).toHaveCount(0);
  await expect(page.locator(".cloud-one")).toHaveCount(1);
  await update(page, "rain_rate", 0.8, "mm/h");
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "rain",
  );
  await expect(page.locator(".sky-drop")).toHaveCount(1);
  await expect(page.locator(".rain-atmosphere i")).toHaveCount(14);
});

test("night and incomplete local observations have honest independent moisture status", async ({
  page,
}) => {
  await ready(page);
  await update(page, "rain_rate", 0, "mm/h");
  await update(page, "rain_wet", "off");
  await setSky(page, -10, 0, "W/m²", "below_horizon");
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "night",
  );
  await expect(page.locator(".moon-disc")).toHaveCount(1);
  await expect(page.locator(".wet-badge:visible").first()).toContainText(
    "TROCKEN",
  );
  await setSky(page, 45, 0.7, "kW/m²");
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "sunny",
  );
  await update(page, "solar", "unavailable");
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "unknown",
  );
  await expect(page.locator(".sky-banner")).toContainText(
    "Wetter nicht bestimmbar",
  );
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    delete win.hass.states["sun.sun"];
    win.card.hass = { ...win.hass };
    await win.card.updateComplete;
  });
  await expect(page.locator(".sky-banner")).toHaveAttribute(
    "data-weather",
    "unknown",
  );
  await expect(page.locator(".sky-banner")).toContainText(
    /Sonnenstatus|Sonnenstand/,
  );
});

test("weather animation preferences leave wind transitions intact and keep static rain accents", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ready(page);
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({ ...win.demoConfig, weather_animation: false });
    await win.card.updateComplete;
  });
  await expect(page.locator(".rain-atmosphere")).not.toHaveClass(/animated/);
  await expect(page.locator(".rain-atmosphere i").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".flow-current")).toHaveCSS(
    "transition-duration",
    "1.1s",
  );
  const drop = await page
    .locator(".rain-atmosphere i")
    .first()
    .evaluate((el) => ({
      y: el.getBoundingClientRect().top,
      panelTop: el.closest(".rain")!.getBoundingClientRect().top,
      panelBottom: el.closest(".rain")!.getBoundingClientRect().bottom,
    }));
  expect(drop.y).toBeGreaterThan(drop.panelTop);
  expect(drop.y).toBeLessThan(drop.panelBottom);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    const win = window as DemoWindow;
    win.setDemoConfig({ ...win.demoConfig, weather_animation: true });
    await win.card.updateComplete;
  });
  await expect(page.locator(".rain-atmosphere i").first()).toHaveCSS(
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
      test(`${view} iPhone ${portrait ? "portrait" : "landscape"} ${theme}: every detail opens, scrolls and closes`, async ({
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
          if (bounds.scrollHeight > bounds.height + 2) {
            await dialog.hover();
            await page.mouse.wheel(0, 600);
            await expect
              .poll(() => dialog.evaluate((el) => el.scrollTop))
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
  await expect(page.locator('[data-key="uv"]').first()).toContainText("4,2");
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
      const roles = ["WS90", "WH40", "WN31"];
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
              .querySelector("header > div:nth-child(2)")!
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

test("GW3000A and WH90 registry variants select only suggestion filters and preserve assigned sources", async ({
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
    await page.evaluate(() => (window as DemoWindow).lastEditorConfig),
  ).toBeUndefined();
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

test("six main metrics form three complete rows on iPhone portrait", async ({
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

test("iPhone touch emulation can tap stacked device statuses and weather details in both orientations", async ({
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
