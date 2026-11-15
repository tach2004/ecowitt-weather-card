import test from "node:test";
import assert from "node:assert/strict";
import { calendarDayWindow, loadDailyTemperature } from "../src/daily-temperature";
import type { HassEntity, HomeAssistant } from "../src/types";
const id = "sensor.fixture_outdoor_temperature";
const now = Date.parse("2026-11-15T12:00:00Z");
function row(time: string, value: string, unit = "°C", entityId = id): HassEntity {
  return {entity_id:entityId,state:value,last_updated:time,attributes:{unit_of_measurement:unit,device_class:"temperature"}};
}
function hass(response: unknown, requests: {method:string;path:string}[] = [], live: HassEntity = row(new Date(now).toISOString(),"12")): HomeAssistant {
  return {
    states:{[id]:live},
    callApi:async<T>(method:string,path:string):Promise<T>=>{requests.push({method,path});return response as T;},
    config:{time_zone:"Europe/Berlin"},
  } as HomeAssistant;
}
const dayRows = () => [
  row("2026-11-14T22:59:00Z","7"), // real preceding state, held at midnight but not a fresh sample
  row("2026-11-14T23:30:00Z","8"),
  row("2026-11-15T06:00:00Z","5"),
  row("2026-11-15T11:00:00Z","14"),
];
test("HA-local calendar windows use real 23-hour and 25-hour Berlin DST days",()=>{
  const spring=calendarDayWindow("Europe/Berlin",Date.parse("2026-03-29T12:00:00Z"));
  assert.equal(new Date(spring.start).toISOString(),"2026-03-28T23:00:00.000Z");
  assert.equal(new Date(spring.end).toISOString(),"2026-03-29T22:00:00.000Z");
  assert.equal(spring.end-spring.start,23*3_600_000);
  const autumn=calendarDayWindow("Europe/Berlin",Date.parse("2026-10-25T12:00:00Z"));
  assert.equal(new Date(autumn.start).toISOString(),"2026-10-24T22:00:00.000Z");
  assert.equal(new Date(autumn.end).toISOString(),"2026-10-25T23:00:00.000Z");
  assert.equal(autumn.end-autumn.start,25*3_600_000);
});
test("UTC and distant HA zones follow their own dates instead of the browser day",()=>{
  const utc=calendarDayWindow("UTC",now);
  assert.equal(new Date(utc.start).toISOString(),"2026-11-15T00:00:00.000Z");
  assert.equal(utc.end-utc.start,24*3_600_000);
  const pacific=calendarDayWindow("America/Los_Angeles",Date.parse("2026-11-15T02:00:00Z"));
  assert.equal(pacific.date,"2026-11-14");
  assert.equal(new Date(pacific.start).toISOString(),"2026-11-14T08:00:00.000Z");
  assert.throws(()=>calendarDayWindow("Not/A_TimeZone",now));
});
test("only the selected real temperature is requested for today's HA-local midnight through now",async()=>{
  const requests:{method:string;path:string}[]=[];
  const result=await loadDailyTemperature(hass([dayRows()],requests),id,{now});
  assert.equal(requests.length,1);
  assert.equal(requests[0].method,"GET");
  const url=new URL(requests[0].path,"http://ha.invalid/");
  assert.equal(url.pathname,"/history/period/2026-11-14T23:00:00.000Z");
  assert.equal(url.searchParams.get("filter_entity_id"),id);
  assert.equal(url.searchParams.get("end_time"),new Date(now).toISOString());
  assert.equal(url.searchParams.has("minimal_response"),false);
  assert.equal(url.searchParams.has("significant_changes_only"),false);
  assert.equal(result.min,5);
  assert.equal(result.max,14);
  assert.equal(result.count,3);
  assert.equal(result.unit,"°C");
  assert.equal(result.end,now);
  assert.equal(new Date(result.dayEnd!).toISOString(),"2026-11-15T23:00:00.000Z");
  assert.match(result.note,/Aufgezeichnete Werte bisher/);
});
test("unknown intervals preserve observed extrema but explicitly mark incomplete coverage",async()=>{
  const rows=dayRows();
  rows.splice(2,0,row("2026-11-15T03:00:00Z","unavailable"));
  const result=await loadDailyTemperature(hass([rows]),id,{now});
  assert.equal(result.status,"partial");
  assert.equal(result.min,5);
  assert.equal(result.max,14);
  assert.equal(result.count,3);
  assert.match(result.note,/Zeitraum unvollständig/);
});
test("only an old initial state cannot become today's extrema, even when live HA has a value",async()=>{
  const result=await loadDailyTemperature(hass([[row("2026-11-13T12:00:00Z","-50")]]),id,{now});
  assert.equal(result.status,"empty");
  assert.equal(result.min,null);
  assert.equal(result.max,null);
  assert.equal(result.count,0);
  assert.match(result.note,/früherer Recorder-Ausgangszustand/);
});
test("partial-day and single-point Recorder history never promises a complete day",async()=>{
  const result=await loadDailyTemperature(hass([[row("2026-11-15T11:30:00Z","12")]]),id,{now});
  assert.equal(result.status,"partial");
  assert.equal(result.min,12);
  assert.equal(result.max,12);
  assert.equal(result.count,1);
  assert.match(result.note,/Tagesanfang/);
  assert.match(result.note,/erst ein gültiger Eintrag/);
});
test("recorded Fahrenheit stays Fahrenheit and mixed temperature units cannot be aggregated",async()=>{
  const fahrenheit=[row("2026-11-14T23:00:00Z","50","°F"),row("2026-11-15T11:30:00Z","64","°F")];
  let result=await loadDailyTemperature(hass([fahrenheit],[],row(new Date(now).toISOString(),"64","°F")),id,{now});
  assert.equal(result.min,50);
  assert.equal(result.max,64);
  assert.equal(result.unit,"°F");
  const mixed=[row("2026-11-14T23:00:00Z","10","°C"),row("2026-11-15T11:30:00Z","64","°F")];
  result=await loadDailyTemperature(hass([mixed]),id,{now});
  assert.equal(result.status,"partial");
  assert.equal(result.min,null);
  assert.equal(result.max,null);
  assert.match(result.note,/Einheitenwechsel/);
});
test("invalid, future, unrelated and physically impossible states do not generate extrema",async()=>{
  const rows=[...dayRows(),
    row("2026-11-15T13:00:00Z","99"),
    row("invalid","99"),
    row("2026-11-15T10:00:00Z","-500"),
    row("2026-11-15T10:30:00Z","500","%"),
    row("2026-11-15T10:30:00Z","500","°C","sensor.fixture_other"),
  ];
  const result=await loadDailyTemperature(hass([rows]),id,{now});
  assert.equal(result.status,"partial");
  assert.equal(result.min,5);
  assert.equal(result.max,14);
  assert.equal(result.count,3);
});
test("stale or unavailable live sensors do not erase actual recorded extrema",async()=>{
  const live=row("2026-11-14T23:00:00Z","unavailable");
  const result=await loadDailyTemperature(hass([dayRows()],[],live),id,{now});
  assert.equal(result.status,"partial");
  assert.equal(result.min,5);
  assert.equal(result.max,14);
  assert.match(result.note,/Sensorabdeckung/);
});
test("missing HA zone, source, Recorder, empty history and failures return honest non-data results",async()=>{
  assert.equal((await loadDailyTemperature({states:{}},id,{now})).status,"unavailable");
  assert.equal((await loadDailyTemperature({states:{}},id,{now,timeZone:"UTC"})).status,"unavailable");
  assert.equal((await loadDailyTemperature({states:{[id]:row(new Date(now).toISOString(),"12")}},id,{now,timeZone:"UTC"})).status,"unavailable");
  assert.equal((await loadDailyTemperature(hass([]),id,{now})).status,"empty");
  assert.equal((await loadDailyTemperature(hass({unexpected:true}),id,{now})).status,"error");
  const failed=hass([]);
  failed.callApi=async()=>{throw new Error("private server text");};
  const result=await loadDailyTemperature(failed,id,{now});
  assert.equal(result.status,"error");
  assert.equal(result.note.includes("private server text"),false);
});


test("a true midnight boundary state affects extrema without becoming a fabricated sample",async()=>{
  const rows=[row("2026-11-14T22:59:00Z","2.0"),row("2026-11-14T23:30:00Z","2.5"),row("2026-11-15T11:00:00Z","6")];
  const result=await loadDailyTemperature(hass([rows]),id,{now,staleAfterMinutes:0});
  assert.equal(result.min,2);
  assert.equal(result.max,6);
  assert.equal(result.count,2);
  assert.equal(result.boundaryContext,true);
  assert.match(result.note,/gehaltener HA-Zustand/);
  assert.match(result.note,/nicht als neue Messung/);
});
test("only an explicit age threshold excludes an old boundary state; unavailable context is never held",async()=>{
  const rows=[row("2026-11-14T21:00:00Z","-20"),row("2026-11-14T23:30:00Z","8"),row("2026-11-15T11:00:00Z","14")];
  let result=await loadDailyTemperature(hass([rows]),id,{now,staleAfterMinutes:5});
  assert.equal(result.min,8);
  assert.equal(result.boundaryContext,false);
  assert.equal(result.status,"partial");
  assert.match(result.note,/eingestellten Altersgrenze/);
  result=await loadDailyTemperature(hass([rows]),id,{now,staleAfterMinutes:0});
  assert.equal(result.min,-20);
  assert.equal(result.boundaryContext,true);
  rows[0]=row("2026-11-14T21:00:00Z","unavailable");
  result=await loadDailyTemperature(hass([rows]),id,{now,staleAfterMinutes:0});
  assert.equal(result.min,8);
  assert.equal(result.boundaryContext,false);
  assert.equal(result.status,"partial");
});
