/** @typedef Message @type { import("./message.js").Message } */

import "dotenv/config";
import OpenAI from "openai";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk";
import { LLMIntentionMessage, BDIResponseMessage, HandshakeMessage } from "./message.js";
import { LLMGoToIntention } from "./llm_intention.js";

export class LLMAgent {
  #socket;
  /** @type { string } */
  #id;

  #baseURL;
  /** @type { string | undefined } */
  #apiKey;
  #model;

  #client;

  #ACTION_PROMPT;
  #FINAL_ANSWER_PROMPT;
  #INTRO_PROMPT;
  #messages;

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

    this.#id = "";

    this.#socket.onYou(agent => this.#id = agent.id);
    this.#socket.onMsg((id, name, msg) => this.#onMsg(id, name, msg));

    this.#ACTION_PROMPT = `
      You are an AI assistant.

      Available tools:
      - ${LLMGoToIntention.TYPE}(dstX, dstY): move the user to the destination (dstX, dstY)

      If the user asks for something that requires movement, respond exactly in this format:

      Action: ${LLMGoToIntention.TYPE}
      Action Input: (dstX, dstY)

      If no tool is needed, answer normally.
      `.trim();

    this.#INTRO_PROMPT = `
      You are an AI assistant which goal is to fine tune some parameters of our agent in order to increase the performance in game.
      The game consists of some BDI agents that have to deliver parcels to get points. Parcels randomly spawn on green tiles and the agents
      have to deliver them to the red ones. You will periodically receive these data as input in this exactly order:

      - score of our agent
      - max number of parcel can spawn in map
      - max score per parcel
      - number of agents
      - mean of attempts to follow a path
      - types of functions to select random destination tiles (used to explore the map)

      Together with the previous parameters' value, in this exactly order:

      - number of possible deviations to pick up a parcel (between 2 and 5)
      - number of tiles to ignore after an obstacle on the path (between 2 and 4)
      - delay in sending movement request to the server (between 0 and 100 ms)
      - type of function to randomize the destination (either cosine or hyperbola)
      - multiplier m to get parcelMinScore = parcelMaxScore * m (between 0.2 and 0.6)

      You are requested to provide new values for each parameter if useful to improve performance.
      `.trim();

    this.#FINAL_ANSWER_PROMPT = `
      You are an AI assistant.

      You receive:
      - the user's original request
      - the action selected by the assistant, if any
      - the observation returned by the tool, if any

      Write a clear and concise final answer for the user.
      If there was a tool error, explain it briefly.
      Do not mention internal implementation details unless useful.
      `.trim();

    this.#messages = [
      {
        role: "system",
        content: this.#ACTION_PROMPT
      }
    ];
  }

  /**
   * @param {string} id 
   * @param {string} name 
   * @param {{}} message
   */
  async #onMsg(id, name, message) {
    if (name == "Admin" || name == "admin") {
      // NOTE: Server sends simple strings
      const msg = String(message);

      // console.log(`LLM (${this.#id}) received "${msg.content}" from Server`)
      const parsedAction = await this.#onTaskReceived(msg);

      if (parsedAction) {
        console.log("LLM Agent received the action:");
        console.log(parsedAction);

        let msg;
        let intention;
        switch (parsedAction.action) {
          case LLMGoToIntention.TYPE:
            const destinationCoordinates = LLMGoToIntention.parseInput(parsedAction.actionInput);
            intention = new LLMGoToIntention(destinationCoordinates);
            break;
        }

        if (intention) {
          msg = new LLMIntentionMessage({ intention: intention });
          this.#sendToAgent(msg);
        }
      }

      return;
    }

    // Accept only messages from the associated BDI agent
    if (
      id != this.#id
      // TODO: ignore every Message even if they come from the BDI agent but some special responses
    ) {
      return;
    }

    let msg;

    // @ts-ignore
    switch (message.type) {
      case HandshakeMessage.TYPE:
        break;
      case LLMIntentionMessage.TYPE:
        break;
      case BDIResponseMessage.TYPE:
        // @ts-ignore
        msg = new BDIResponseMessage(message);
        console.log(`LLM received "${msg.content}" from ${name}`);
        break;
    }
  }

  /**
   * @param {string} task 
   */
  async #onTaskReceived(task) {
    if (task.trim() == "") {
      return;
    }

    // Add the server task to memory
    this.#messages.push({
      role: "user",
      content: task,
    });

    console.log(this.#messages);

    // Ask the model whether it wants to answer directly or use a tool.
    const assistantDecision = await this.#callModel(this.#messages);
    console.log(`Assistant decision:\n${assistantDecision}\n`);

    // Store the result in a variable called assistantDecision and save it in the messages array.
    this.#messages.push({
      role: "assistant",
      content: assistantDecision,
    });

    // Parse the assistant decision
    const parsedAction = this.#extractAction(assistantDecision);

    // If no tool is requested, the model already answered ...
    if (!parsedAction) {
      console.log(`Assistant: ${assistantDecision}\n`);
      console.log(`Memory contains ${this.#messages.length} messages.\n`);
      return;
    }

    // ... otherwise a tool is requested, execute it
    const { action, actionInput } = parsedAction;
    let observation;

    // Execute the selected tool
    if (action == LLMGoToIntention.TYPE) {
      console.log(`[System executing tool: ${action} ("${actionInput}")]`);
      observation = "MOVE"; // actual action for the BDI agent
    } else {
      observation = `Error: unknown tool '${action}'`;
    }

    console.log(`[Observation: ${observation}]\n`);

    // Add the observation to memory
    this.#messages.push({
      role: "user",
      content: `Observation: ${observation}`,
    });

    // Ask the model for the final answer
    const finalAnswer = await this.#callModel(
      [
        {
          role: "system",
          content: this.#FINAL_ANSWER_PROMPT,
        },
        {
          role: "user",
          content:
            `Original user request:\n${task}\n\n` +
            `Assistant decision:\n${assistantDecision}\n\n` +
            `Tool observation:\n${observation}`,
        },
      ]
    );

    console.log(`Assistant: ${finalAnswer}\n`);

    // Store final answer in the conversation memory
    this.#messages.push({
      role: "assistant",
      content: finalAnswer,
    });

    console.log(`Memory contains ${this.#messages.length} messages.\n`);

    return parsedAction;
  }

  /**
   * @param {{role: string, content: string}[]} messages 
   * @param {Number} temperature 
   */
  async #callModel(messages, temperature = 0.1) {
    const response = await this.#client.chat.completions.create({
      model: this.#model,
      // @ts-ignore
      messages,
      temperature,
    });

    return response.choices?.[0]?.message?.content ?? "";
  }

  /**
   * @param {string} text 
   */
  #extractAction(text) {
    const actionMatch = text.match(/Action:\s*(.*)/);
    const actionInputMatch = text.match(/Action Input:\s*(.*)/);

    if (!actionMatch || !actionInputMatch) {
      return null;
    }

    return {
      action: actionMatch[1].trim(),
      actionInput: actionInputMatch[1].trim(),
    };
  }

  /**
   * @param {Message} msg 
   */
  #sendToAgent(msg) {
    this.#socket.emitSay(
      this.#id,
      msg
    );
  }
}
