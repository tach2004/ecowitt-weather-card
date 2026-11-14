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
  await page.evaluate(() => {
    const card = (window as DemoWindow).card;
    const events: string[] = [];
    (card as any)._debugDialog = events;
    const dlg = card.shadowRoot.querySelector("dialog");
    const show = dlg.showModal.bind(dlg);
    const close = dlg.close.bind(dlg);
    dlg.showModal = () => { events.push("showModal called"); try { return show(); } catch (e) { events.push("showModal error: " + e); throw e; } };
    dlg.close = () => { events.push("close called: " + new Error().stack); return close(); };
    const oldOpen = card._openDetail.bind(card);
    card._openDetail = async (...args: any[]) => {
      events.push("open detail called");
      try { await oldOpen(...args); events.push("open detail resolved"); }
      catch (e) { events.push("open detail rejected: " + e); }
    };
  });
  await page.locator('[data-detail="temperature"]:visible').first().click();
  const diagnostic = await page.evaluate(() => {
    const card = (window as DemoWindow).card;
    const dialog = card.shadowRoot?.querySelector("dialog");
    return {
      events: (card as any)._debugDialog,
      detail: card._detail, dialogPresent: !!dialog,
      open: dialog?.open, rect: dialog?.getBoundingClientRect().toJSON(),
      buttons: [...card.shadowRoot.querySelectorAll('[data-detail="temperature"]')].map(
        (el: Element) => ({visible: !!el.getBoundingClientRect().width, tag: el.tagName})
      ),
    };
  });
  console.log("TEMP_DIALOG_DIAGNOSTIC", JSON.stringify(diagnostic));
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
  const geometry = await page
    .locator(".target")
    .evaluate((el) => ({
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

test("320px summary contains long German labels with a wider fallback font", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 874 });
  for (const view of ["panel", "sections"]) {
    await ready(page, `/?view=${view}`);
    await page.locator("ecowitt-weather-card").evaluate((card) => {
      // A real 16px monospace fallback exposes intrinsic grid minimums that can
      // differ between the local machine and GitHub's installed system fonts.
      (card as HTMLElement).style.setProperty("--paper-font-body1_-_font-family", "monospace");
    });
    const summary = page.locator(".mobile-summary");
    await expect(summary.locator(".label").nth(1)).toContainText("Feuchtigkeitsstatus");
    const layout = await summary.evaluate((element) => {
      const root = element.closest("ha-card")!.getBoundingClientRect();
      const nodes = [element, ...element.querySelectorAll("button, span")];
      return {
        font: getComputedStyle(element).fontFamily,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        outside: nodes.filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && (rect.left < root.left - 1 || rect.right > root.right + 1);
        }).map((node) => node.className),
        overflowing: nodes.filter((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1).map((node) => node.className),
      };
    });
    expect(layout.font).toContain("monospace");
    expect(layout.pageOverflow).toBe(false);
    expect(layout.outside).toEqual([]);
    expect(layout.overflowing).toEqual([]);
  }
});

test("compass degrees and actual WH40 rain animation, never just wet Piezo", async ({ page }) => {
  await ready(page);
  await expect(page.locator(".degree-ring text")).toHaveCount(8);
  await expect(page.locator(".degree-ring")).toContainText("315°");
  await expect(page.locator(".rain-atmosphere i")).toHaveCount(14);
  await update(page, "rain_rate", 0, "mm/h");
  await update(page, "rain_wet", "on");
  await expect(page.locator(".rain-atmosphere")).toHaveCount(0);
  await expect(page.locator(".sky-banner")).toContainText("Oberfläche nass");
});

test("source-grounded device status shows battery percent, raw dBm and real connectivity", async ({ page }) => {
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
        entity_id: id, state, last_updated: now, last_changed: now,
        attributes: { friendly_name: id, unit_of_measurement: unit, device_class: deviceClass },
      };
    win.setDemoConfig({
      ...win.demoConfig,
      device_status: [{
        device_id: "demo-ws90", role: "WS90", name: "Test WS90",
        show_on_main: true,
        battery: "sensor.test_ws90_battery",
        signal: "sensor.test_ws90_signal",
        connection: "binary_sensor.test_ws90_connected",
      }],
    });
    await win.card.updateComplete;
  });
  const badge = page.locator(".device-chip");
  await expect(badge).toContainText("WS90");
  await expect(badge).toContainText("64 %");
  await expect(badge).toContainText("-68 dBm");
  await expect(badge).toContainText("Verbunden");
  await page.locator(".device-chip").click();
  await expect(page.getByRole("dialog")).toContainText("Test WS90");
});

test("new editor uses checkbox lists and persists theme preferences", async ({ page }) => {
  await ready(page, "/?editor=1");
  const editor = page.locator("ecowitt-weather-card-editor");
  await editor.locator("summary").filter({ hasText: "Darstellung, Wetteranimation" }).click();
  await editor.getByLabel("Farbschema").selectOption("dark");
  await expect.poll(() =>
    page.evaluate(() => (window as DemoWindow).lastEditorConfig?.theme_mode)
  ).toBe("dark");
  await editor.locator("summary").filter({ hasText: "Zusatzsensoren & Diagnosen" }).click();
  const list = editor.locator(".checkbox-list").first();
  await expect(list.locator('select[multiple]')).toHaveCount(0);
  const existing = list.locator(".check-row").filter({ hasText: "Beispiel Zusatzkanal WN31" })
    .locator('input[type="checkbox"]').first();
  await expect(existing).toBeVisible();
  await existing.uncheck();
  await expect.poll(() =>
    page.evaluate(() => (window as DemoWindow).lastEditorConfig?.extra_entities?.length)
  ).toBe(0);
  await existing.check();
  await expect.poll(() =>
    page.evaluate(() => (window as DemoWindow).lastEditorConfig?.extra_entities?.length)
  ).toBe(1);
  expect(await editor.getByLabel(/Bildpfad|Bildquelle/).count()).toBeGreaterThan(0);
});
