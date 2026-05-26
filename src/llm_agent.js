/** @typedef Message @type { import("./message.js").Message } */

import "dotenv/config";
import OpenAI from "openai";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk";
import { ActionMessage, BDIRespondeMessage, MessageType } from "./message.js";

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

    this.#id = ""

    this.#socket.onYou(agent => this.#id = agent.id);
    this.#socket.onMsg((id, name, msg) => this.#onMsg(id, name, msg));

    this.#ACTION_PROMPT = `
      You are an AI assistant.

      Available tools:
      - goTo(dstX, dstY): move the user to the destination (dstX, dstY)

      If the user asks for something that requires movement, respond exactly in this format:

      Action: goTo
      Action Input: (dstX, dstY)

      If no tool is needed, answer normally.
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
    ]
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
        console.log("LLM Agent received the action:")
        console.log(parsedAction)

        const msg = new ActionMessage(parsedAction);
        this.#sendToAgent(msg);
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
      case MessageType.HandshakeMessage:
        break;
      case MessageType.ActionMessage:
        break;
      case MessageType.BDIRespondeMessage:
        // @ts-ignore
        msg = new BDIRespondeMessage(message);
        console.log(`LLM received "${msg.content}" from ${name}`)
        break
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
    if (action == "goTo") {
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
    )
  }
}
