import { DjsClientSocket } from '@unitn-asa/deliveroo-js-sdk';
import { evaluate } from 'mathjs';
import { LLMMapRequestMessage, LLMMapResponseMessage } from './message.js';
import { MapPoint } from './path_utils.js';
import OpenAI from 'openai';

/**
 * @param {string} expression 
 */
export function calc(expression) {
  return evaluate(expression);
}

/**
 * 
 * @param {DjsClientSocket} socket 
 * @param {string} agentId
 * @param {string} position 
 */
export async function findExtremePosition(socket, agentId, position = "leftmost") {
  const request = new LLMMapRequestMessage();
  const response = await socket.emitAsk(agentId, request);

  if (!("type" in response) || !("map" in response)) {
    return "none";
  }

  if (response.type != LLMMapResponseMessage.TYPE) {
    return "none";
  }

  const map = /**@type {LLMMapResponseMessage}*/(response).map;

  if (map.length == 0) {
    return "none";
  }

  let leftMost = new MapPoint({ x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER, w: "" });
  let rightMost = new MapPoint({ x: Number.MIN_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER, w: "" });
  let topMost = new MapPoint({ x: Number.MIN_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER, w: "" });
  let bottomMost = new MapPoint({ x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER, w: "" });

  for (let i = 0; i < map[0].length; i += 1) {
    for (let j = 0; j < map[i].length; j += 1) {
      // Accept only red tiles
      if (map[i][j] == '2') {
        if (i < leftMost.x) {
          leftMost = new MapPoint({ x: i, y: j, w: "" });
        }
        if (i > rightMost.x) {
          rightMost = new MapPoint({ x: i, y: j, w: "" });
        }
        if (j > topMost.y) {
          topMost = new MapPoint({ x: i, y: j, w: "" });
        }
        if (j < bottomMost.y) {
          bottomMost = new MapPoint({ x: i, y: j, w: "" });
        }
      }
    }
  }

  switch (position) {
    case "leftmost":
      return `Coordinates: ${leftMost.x},${leftMost.y}`;
    case "rightmost":
      return `Coordinates: ${rightMost.x},${rightMost.y}`;
    case "topmost":
      return `Coordinates: ${topMost.x},${topMost.y}`;
    case "bottommost":
      return `Coordinates: ${bottomMost.x},${bottomMost.y}`;
    default:
      return "none";
  }
}

/**
 * 
 * @param {string} url 
 * @param {string} question
 */
export async function webSearch(url, question) {
  const res = await fetch(url);
  const html = await res.text();

  const baseURL = process.env.LITELLM_BASE_URL || "https://llm.bears.disi.unitn.it/v1";
  const model = process.env.LOCAL_MODEL || "llama-3.3-70b-lmstudio";
  const apiKey = process.env.LITELLM_API_KEY;
  const client = new OpenAI({
    baseURL: baseURL,
    apiKey: apiKey,
  });

  const prompt = `You are about to receive an html document. Find the answer at the question ${question}. Limit the answer, don't add your reasoning. Less word are present in your answer, the better. The document is the following ${html}`.trim();

  const response = await client.chat.completions.create({
    model: model,
    // @ts-ignore
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1
  });

  return response.choices?.[0]?.message?.content ?? "";
}

/**
 * @param {string} location 
 */
export async function getLatLong(location) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${location}`);
  const response = (await res.json()).results;

  if (!("latitude" in response[0]) || !("longitude" in response[0])) {
    return ["0", "0"];
  }

  return [response[0].latitude, response[0].longitude];

}

/**
 * 
 * @param {string} location 
 */
export async function getTemp(location) {
  const [lat, long] = await getLatLong(location);

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${long}&hourly=temperature_2m`);
  const response = await res.json();

  if (!("hourly" in response)) {
    return "0";
  }

  return response.hourly.temperature_2m[0];
}