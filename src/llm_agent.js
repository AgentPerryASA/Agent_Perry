import "dotenv/config";
import OpenAI from "openai";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk";
import { Message } from "./message.js";

export class LLMAgent {
  #socket;
  /** @type { string } */
  #id;
  /** @type { string } */
  #mateId;

  #baseURL;
  /** @type { string | undefined } */
  #apiKey;
  #model;

  #client;

  /**
   * @param {string} token 
   */
  constructor(token) {
    this.#socket = DjsConnect(undefined, token);

    this.#baseURL = process.env.LITELLM_BASE_URL || "https://llm.bears.disi.unitn.it/v1";
    this.#apiKey = process.env.LITELLM_API_KEY;
    this.#model = process.env.LOCAL_MODEL || "llama-3.3-70b-lmstudio";

    if (!this.#apiKey) {
      console.error("Error: missing LITELLM_API_KEY in .env file");
      process.exit(1);
    }

    this.#client = new OpenAI({
      baseURL: this.#baseURL,
      apiKey: this.#apiKey,
    });

    this.#id = ""
    this.#mateId = ""

    this.#socket.onYou(agent => this.#id = agent.id);
    // @ts-ignore
    this.#socket.onMsg((id, name, msg) => this.#onMsg(id, name, msg));
  }

  /**
   * @param {string} id 
   * @param {string} name 
   * @param {Message} msg 
   */
  #onMsg(id, name, msg) {
    // Accept only messages from the associated BDI agent
    if (id != this.#id) {
      return;
    }

    if (msg.handshake && msg.content == process.env.HANDSHAKE_MSG) {
      this.#mateId = id;
      console.log(`LLM (${this.#id}) received handshake from ${name}`)
      return;
    }

    console.log(`LLM (${this.#id}) received "${msg.content}" from ${name}`)
  }

  sendToAgent() {
    this.#socket.emitSay(
      this.#id,
      new Message("Test message from LLM")
    )
  }
}


