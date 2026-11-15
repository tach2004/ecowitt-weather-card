import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

// Supply an unmodified, locally downloaded upstream release when verifying this
// optional integration. Neither the distributable nor a runtime download ships.
const upstreamPath = process.env.WINDROSE_UPSTREAM_JS;

test(
  "installed upstream windrose renders local history, retains state, and stops polling on removal",
  {
    skip: upstreamPath
      ? false
      : "Set WINDROSE_UPSTREAM_JS to the local windrose-card.js release to exercise the real installed card.",
  },
  async () => {
    await access(upstreamPath!);
    const upstream = await readFile(upstreamPath!);
    const bundle = await build({
      entryPoints: ["src/windrose-host.ts"],
      bundle: true,
      format: "esm",
      write: false,
      target: "es2022",
      tsconfig: "tsconfig.json",
    });
    const server = createServer((request, response) => {
      if (request.url === "/upstream.js" || request.url === "/host.js") {
        response.setHeader("Content-Type", "text/javascript");
        response.end(
          request.url === "/upstream.js"
            ? upstream
            : bundle.outputFiles[0].contents,
        );
        return;
      }
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<!doctype html><html><head><style>body{width:380px;margin:0;background:#102330;color:#e8f2f9}ha-card{display:block}</style></head><body><script type="module" src="/host.js"></script></body></html>',
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const browser = await chromium.launch({
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      headless: true,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 400, height: 850 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // Every resource must stay local, including when using the real upstream JS.
      const remoteRequests: string[] = [];
      await page.route("**/*", async (route) => {
        if (new URL(route.request().url()).origin !== origin) {
          remoteRequests.push(route.request().url());
          await route.abort();
        } else await route.continue();
      });
      await page.goto(origin);
      await page.waitForFunction(() =>
        customElements.get("ecowitt-windrose-host"),
      );
      await page.evaluate(`(() => {
      window.localRequests=[];
      const timestamp = Math.floor(Date.now()/1000);
      window.demoHass={
        states:{
          'sensor.demo_speed':{entity_id:'sensor.demo_speed',state:'8',attributes:{unit_of_measurement:'km/h'}},
          'sensor.demo_direction':{entity_id:'sensor.demo_direction',state:'292',attributes:{unit_of_measurement:'°'}}
        },
        entities:{}, connection:{connected:true}, config:{time_zone:'Europe/Berlin'},
        locale:{language:'de',number_format:'decimal_comma',time_format:'24',date_format:'DMY',first_weekday:'monday',time_zone:'server'},
        localize:key=>key,
        callWS:async message=>{
          window.localRequests.push(message);
          const id=message.entity_ids[0];
          return {[id]:Array.from({length:96},(_,i)=>({lu:timestamp-86400+i*900,s:String(id.endsWith('direction')?i*15%360:4+i%12)}))};
        }
      };
      window.host=document.createElement('ecowitt-windrose-host');
      host.hass=window.demoHass;
      host.entities={wind_speed:'sensor.demo_speed',wind_direction:'sensor.demo_direction'};
      host.options={enabled:true};
      document.body.append(host);
    })()`);
      await page.waitForFunction(
        `document.querySelector('ecowitt-windrose-host').shadowRoot.textContent.includes('HACS-Ressource')`,
      );
      assert.deepEqual(await page.evaluate("window.localRequests"), []);

      await page.addScriptTag({ url: `${origin}/upstream.js`, type: "module" });
      await page.waitForFunction(() => customElements.get("windrose-card"));
      await page.getByRole("button", { name: "Erneut prüfen" }).click();
      await page.waitForFunction(`(() => {
      const card=host.shadowRoot.querySelector('windrose-card');
      return card?.shadowRoot?.querySelectorAll('svg path').length > 10 && window.localRequests.length >= 2;
    })()`);
      const initial = await page.evaluate<{
        error: string;
        interval: boolean;
        width: number;
        svgWidth: number;
        requests: { type: string; entity_ids: string[] }[];
      }>(`(() => {
      window.installed=host.shadowRoot.querySelector('windrose-card');
      return {error:installed.shadowRoot.querySelector('#error-container').textContent,
        interval:installed.updateInterval!==undefined, width:installed.getBoundingClientRect().width,
        svgWidth:installed.shadowRoot.querySelector('svg').getBoundingClientRect().width,
        requests:window.localRequests.map(({type,entity_ids})=>({type,entity_ids}))};
    })()`);
      assert.equal(initial.error, "");
      assert.equal(initial.interval, true);
      assert.ok(initial.width > 300 && initial.width <= 380);
      assert.ok(initial.svgWidth > 300 && initial.svgWidth <= 380);
      assert.deepEqual(initial.requests, [
        {
          type: "history/history_during_period",
          entity_ids: ["sensor.demo_direction"],
        },
        {
          type: "history/history_during_period",
          entity_ids: ["sensor.demo_speed"],
        },
      ]);
      await page.evaluate(
        `host.hass={...window.demoHass,states:{...window.demoHass.states,'sensor.demo_direction':{...window.demoHass.states['sensor.demo_direction'],state:'301'}}}`,
      );
      await page.waitForFunction(
        `host.shadowRoot.querySelector('windrose-card')._hass.states['sensor.demo_direction'].state==='301'`,
      );
      assert.equal(
        await page.evaluate(
          `host.shadowRoot.querySelector('windrose-card')===window.installed`,
        ),
        true,
      );
      assert.equal(await page.evaluate("window.localRequests.length"), 2);

      await page.evaluate("host.active=false");
      await page.waitForFunction(
        `!host.shadowRoot.querySelector('windrose-card')`,
      );
      assert.equal(
        await page.evaluate("window.installed.updateInterval===undefined"),
        true,
      );
      await page.evaluate("host.active=true");
      await page.waitForFunction(
        `host.shadowRoot.querySelector('windrose-card')?.updateInterval!==undefined`,
      );
      assert.equal(
        await page.evaluate(
          `host.shadowRoot.querySelector('windrose-card')!==window.installed`,
        ),
        true,
      );
      await page.evaluate("host.reducedMotion=true");
      await page.waitForFunction(
        `host.shadowRoot.querySelector('windrose-card')?.cardConfig.disableAnimations===true`,
      );
      assert.equal(
        await page.evaluate(
          `host.shadowRoot.querySelector('windrose-card').cardConfig.currentDirection.showArrow`,
        ),
        false,
      );
      await page.evaluate(
        `window.finalCard=host.shadowRoot.querySelector('windrose-card');host.remove()`,
      );
      assert.equal(
        await page.evaluate("window.finalCard.updateInterval===undefined"),
        true,
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(remoteRequests, []);
    } finally {
      await browser.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
