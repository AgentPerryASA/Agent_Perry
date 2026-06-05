/** @typedef Message @type { import("./utils/message.js").Message } */

import "dotenv/config";
import OpenAI from "openai";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk";
import { LLMIntentionMessage, BDIResponseMessage, HandshakeMessage, LLMParametersTuningRequestMessage, LLMSetIdMessage, LLMParametersTuningResponseMessage } from "./utils/message.js";
import { LLMGoToIntention } from "./llm_intention.js";
import { LLMUpdatedParameters } from "./utils/beliefs_utils.js";
import { calc, findExtremePosition, getLatLong, getTemp, webSearch } from "./utils/llm_tools.js";

export class LLMAgent {
  #socket;
  /** @type { string } */
  #id;
  /**@type {string} */
  #mateId;

  #baseURL;
  /** @type { string | undefined } */
  #apiKey;
  #model;

  #client;

  #INTRO_ACTION_PROMPT;
  #INTRO_PARAMS_TUNING_PROMPT;
  #paramsTuningMessages;
  #actionMessages;

  /**
   * Contains messages types for which the LLM has to accept messages from both the agents
   * @type {string[]}
   */
  #whitelist;

  #wasLLMIdSent;

  /**
   * @param {string} token 
   */
  constructor(token) {
    this.#socket = DjsConnect(undefined, token);

    this.#baseURL = process.env.LITELLM_BASE_URL || "https://llm.bears.disi.unitn.it/v1";
    this.#apiKey = process.env.LITELLM_API_KEY;
    this.#model = process.env.LOCAL_MODEL || "llama-3.3-70b-lmstudio";
    this.#wasLLMIdSent = false;
    if (!this.#apiKey) {
      console.error("Error: missing LITELLM_API_KEY in .env file");
      process.exit(1);
    }

    this.#client = new OpenAI({
      baseURL: this.#baseURL,
      apiKey: this.#apiKey,
    });

    this.#id = "";
    this.#mateId = "";
    this.#whitelist = [HandshakeMessage.TYPE, LLMParametersTuningRequestMessage.TYPE];

    this.#socket.onYou(agent => {
      if (!this.#wasLLMIdSent) {
        this.#wasLLMIdSent = true;
        this.#id = agent.id;
      }
    });

    this.#socket.onMsg((id, name, msg) => this.#onMsg(id, name, msg));

    this.#socket.on;

    this.#INTRO_ACTION_PROMPT = `
      You are an AI assistant whose goal is helping agents in a game to perform certain activity.
      The game consists of some BDI agents that have to deliver parcels to get points. Parcels randomly spawn on green tiles and the agents
      have to deliver them to the red ones. There is a requirement that must always be respected: the answer must not contain any question or reasoning.

      Available tools:
      - ignoreTask: use this tool only to say that it is not convenient to solve the task (because it would decrement the value of a parcel or the score of the agent). No input.
      - ${calc.name}: calculate the result of a mathematical expression. Input is the mathematical expression.
      - ${findExtremePosition.name}: find an extreme position on the map. Available input are leftmost, rightmost, topmost and bottommost. If the position cannot be determine, the tool return the string "none". In such case, the next message must contain ignoreTask tool.
      - ${getLatLong.name}: get latitude and longitude of a real location (no tiles or coordinate of the game) given its english name. Input is the english name of a location (like a city).
      - ${getTemp.name}: get the current temperature in a location given its english name. Input is the english name of a location.
      - setQuestion: set a question for a web search. Input is the question.
      - ${webSearch.name}: get an information contained in a specific website. Use first the tool setQuestion before using this tool. Input is the url of the website. Use this tool only if there is not a more appropriate tool.

      Available actions:
      - ${LLMGoToIntention.TYPE}: tell the agent to go to a specific tile. Use this tool also if the question ask to drop or pick up a parcel. Requires coordinates in the following format, containing:
        - destinationX: <x coordinate>
        - destinationY: <y coordinate>
        Coordinates must be a positive integer number. This tool MUST be used if the question was to drop/get a parcel to/from some tile or to simply move to another place.
      - directAnswer: make the agent say a certain phrase; Input is the phrase. Don't use this tool unless the question is asking to say some sort of information without involving any other action. Example: requiring to drop or get a parcel is not something suitable for this tool. If the question asked to go to a certain tile this action is not suitable.

      Do not include any motivation, just reply in the form:
        Action: <exact name of the action or the tool to use>
        Input <input name or only Input if a tool is needed>: <eventual parameters of <input name or of the tool>, otherwise write none>

      Every tool can be used with one input only. You must write only one action per message and one input per action. You must answer with the layout. You must answer with a definitive answer, no correction are allowed.
      
      You are required to analyze the history of messages, understand what tool is needed next or write the final answer as per instruction. Again, your answers has to only include the template.
      `.trim();

    this.#INTRO_PARAMS_TUNING_PROMPT = `
      You are an AI assistant which goal is to fine tune some parameters of our agent in order to increase the performance in game.
      The game consists of some BDI agents that have to deliver parcels to get points. Parcels randomly spawn on green tiles and the agents
      have to deliver them to the red ones. You will periodically receive these data as input in this exactly order:

      - score of our agent
      - max number of parcels that can spawn in map
      - average score per parcel
      - variance score per parcel (final score is a random in [avg - var, avg + var])
      - number of agents
      - mean of attempts to follow a path
      - types of functions to select random destination tiles (used to explore the map)

      Together with the previous parameters' value, in this exactly order:

      - number of possible deviations to pick up a parcel (between 2 and 5)
      - number of tiles to ignore after an obstacle on the path (between 2 and 4)
      - delay in sending movement request to the server (between 0 and 100 ms)
      - type of function to randomize the destination (cosine for higher randomicity, hyperbola for privileging close tiles)
      - multiplier m to get parcelMinScore = parcelMaxScore * m (between 0.2 and 0.6)

      You are requested to provide new values for each parameter if useful to improve performance. Compare the input with previous data if any to better understand how to predict the values. Do not include any motivation, just reply in the form

      - <given_param_description>: <new_value>
      `.trim();

    this.#paramsTuningMessages = new Map();

    this.#actionMessages = [
      {
        role: "system",
        content: this.#INTRO_ACTION_PROMPT
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
      const parsedAction = await this.#onActionReceived(msg);

      if (parsedAction) {
        console.log("LLM Agent received the action:");
        console.log(parsedAction);

        let msg;
        let intention;

        switch (parsedAction.action) {
          case LLMGoToIntention.TYPE:
            const destinationCoordinates = LLMGoToIntention.parseInput(parsedAction.actionInput);
            intention = new LLMGoToIntention(destinationCoordinates);
            console.log("RESULT: ", intention);
            break;
          case "directAnswer":
            console.log("RESULT: ", parsedAction.actionInput);
            this.#socket.emitShout(parsedAction.actionInput);
            break;
          default:
            console.log("RESULT DEFAULT: ", parsedAction.actionInput);
            return;
        }

        if (intention) {
          msg = new LLMIntentionMessage({ intention: intention });
          this.#sendToAgent(msg);
        }
      }

      return;
    }

    // Accept only messages from the associated BDI agent and its mate
    // TODO: ignore every Message even if they come from the BDI agent but some special responses
    if ((typeof message === "string") || !("type" in message) || ((id != this.#id || id != this.#mateId) && !this.#whitelist.includes(/**@type {string}*/(message.type)))) {
      //Reject if message was written in chat (not useful at this point) or the message if from the other peer and it is not whitelisted
      return;
    }

    let msg;

    switch (message.type) {
      case HandshakeMessage.TYPE:
        if (!("key" in message)) {
          return;
        }
        const handshakeKey = process.env.HANDSHAKE_KEY;
        if (!handshakeKey) {
          console.error("Error: missing HANDSHAKE_KEY in .env file");
          process.exit(1);
        }
        const convertedMsg = new HandshakeMessage({ key: /**@type {string}*/(message.key) });
        if (id != this.#id && convertedMsg.key == handshakeKey) {
          const msg = new LLMSetIdMessage({ llmAgentId: this.#id });
          this.#mateId = id;
          this.#sendToAgent(msg);
          this.#sendToAgent(msg, this.#mateId);

          // Use 2 different messages histories for the 2 BDI agents
          this.#paramsTuningMessages.set(
            this.#id,
            [
              {
                role: "system",
                content: this.#INTRO_PARAMS_TUNING_PROMPT
              }
            ]
          );
          this.#paramsTuningMessages.set(
            this.#mateId,
            [
              {
                role: "system",
                content: this.#INTRO_PARAMS_TUNING_PROMPT
              }
            ]
          );
        }
        break;
      case LLMIntentionMessage.TYPE:
        break;
      case BDIResponseMessage.TYPE:
        // @ts-ignore
        msg = new BDIResponseMessage(message);
        console.log(`LLM received "${msg.content}" from ${name}`);
        break;
      case LLMParametersTuningRequestMessage.TYPE:
        if (!("currentParameters" in message)) {
          return;
        }

        console.log(`\n${name}`);

        msg = new LLMParametersTuningRequestMessage({ currentParameters: /**@type {string}*/(message.currentParameters) });

        if (this.#paramsTuningMessages.get(id).length == 7) {
          // If the conversation history is too long, forget about the oldest conversation (maintaining the INTRO_PROMPT)
          this.#paramsTuningMessages = this.#paramsTuningMessages.get(id).splice(1, 2);
        }

        const parameters = await this.#onParametersTuningRequested(id, msg.currentParameters);

        if (!(parameters instanceof LLMUpdatedParameters)) {
          return;
        }

        const responseMsg = new LLMParametersTuningResponseMessage({ updatedParameters: parameters });

        this.#sendToAgent(responseMsg, id);
        break;
      default:
        break;
    }
  }

  /**
   * @param {string} id 
   * @param {string} text 
  */
  async #onParametersTuningRequested(id, text) {
    if (text.trim() == "") {
      return;
    }

    console.log(`(${id}) LLM received:`);
    console.log(text);

    this.#paramsTuningMessages.get(id).push({
      role: "user",
      content: text,
    });

    // Ask the model whether it wants to answer directly or use a tool.
    const assistantDecision = await this.#callModel(this.#paramsTuningMessages.get(id));
    console.log(`\n(${id}) Assistant decision:\n${assistantDecision}\n`);

    // Store the result in a variable called assistantDecision and save it in the messages array.
    this.#paramsTuningMessages.get(id).push({
      role: "assistant",
      content: assistantDecision,
    });

    const res = this.#extractValues(assistantDecision);

    if (res) {
      return res;
    }

    return;
  }

  /**
   * @param {string} task 
  */
  async #onActionReceived(task) {
    let setQuestion = "";

    if (task.trim() == "") {
      return;
    }

    // Add the server task to memory
    this.#actionMessages.push({
      role: "user",
      content: task,
    });

    // Ask the model whether it wants to answer directly or use a tool.
    const assistantDecision = await this.#callModel(this.#actionMessages);

    // Store the result in a variable called assistantDecision and save it in the messages array.
    this.#actionMessages.push({
      role: "assistant",
      content: assistantDecision,
    });

    // Parse the assistant decision
    const parsedAction = this.#extractAction(assistantDecision);

    // If no tool is requested, the model already answered ...
    if (!parsedAction) {
      console.log(`Assistant pre-loop:\n ${assistantDecision}\n`);
      return parsedAction;
    }

    // ... otherwise a tool is requested, execute it
    let wasFinalAnswer = false;
    let latestAnswer = assistantDecision;
    let res;
    let { action, actionInput } = { action: "a", actionInput: "b" };

    do {
      res = this.#extractAction(latestAnswer);
      action = res ? res.action : "a";
      actionInput = res ? res.actionInput : "b";
      let result;
      console.log(`Assistant:\n${assistantDecision}\n`);
      console.log(action, actionInput, latestAnswer);
      // Execute the selected tool
      switch (action) {
        case "ignoreTask":
          return undefined;
        case calc.name:
          result = calc(actionInput);
          break;
        case getLatLong.name:
          result = await getLatLong(actionInput);
          break;
        case getTemp.name:
          result = await getTemp(actionInput);
          break;
        case "setQuestion":
          setQuestion = actionInput;
          break;
        case webSearch.name:
          result = await webSearch(actionInput, setQuestion);
          break;
        case findExtremePosition.name:
          result = await findExtremePosition(this.#socket, this.#id, actionInput);
          break;
        default:
          wasFinalAnswer = true;
          break;
      }

      //If it was the final answer (no tool detected) break the cycle
      if (wasFinalAnswer) {
        //Clear the message list
        this.#actionMessages.splice(1, this.#actionMessages.length);
        console.log("END:", latestAnswer);
        return res;
      }

      // Otherwise add the observation to memory
      this.#actionMessages.push({
        role: "user",
        content: `Tool result for ${action} ("${actionInput}"): ${result}`,
      });

      //And repeat
      latestAnswer = await this.#callModel(this.#actionMessages);
      console.log("new answer", latestAnswer);
    } while (!wasFinalAnswer);
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
  #extractValues(text) {
    const lines = text.split(/\r?\n|\r|\n/g);
    const values = [];
    for (const line of lines) {
      values.push(line.split(":")[1].trim());
    }

    const numDeviation = this.#clamp(Number(values[0]), 2, 5);
    const blocksAfterAgent = this.#clamp(Number(values[1]), 2, 4);
    const movementDelay = this.#clamp(Number(values[2].match(/\d+/)), 0, 100);
    const randomFunction = values[3];
    const minScoreMultiplier = this.#clamp(Number(values[4]), 0.2, 0.6);

    return new LLMUpdatedParameters(
      numDeviation,
      4,
      blocksAfterAgent,
      movementDelay,
      randomFunction,
      minScoreMultiplier
    );
  }

  /**
   * @param {number} value
   * @param {number} min 
   * @param {number} max 
   */
  #clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  /**
   * @param {string} text 
   */
  #extractAction(text) {
    const actionMatch = text.match(/Action:\s*(.*)/);
    const actionInputMatch = text.match(/Input:\s*(.*)/);

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
   * @param {string} agentId
   */
  #sendToAgent(msg, agentId = this.#id) {
    this.#socket.emitSay(
      agentId,
      msg
    );
  }
}
