/** @typedef Message @type { HandshakeMessage | LLMIntentionMessage | LLMIntentionTakenChargeMessage | BDIResponseMessage | LLMSetIdMessage | LLMParametersTuningResponseMessage | LLMMapRequestMessage | LLMMapResponseMessage} */
/** @typedef LLMIntention @type {import("../llm_intention.js").LLMIntention} */

import { LLMUpdatedParameters } from "./beliefs_utils.js";
import { Coordinates } from "./coordinates.js";

export class HandshakeMessage {
  static #TYPE = "handshake";

  type;
  key;

  /**
   * @param {{key: string}} message
   */
  constructor({ key }) {
    this.type = HandshakeMessage.#TYPE;
    this.key = key;
  }

  static get TYPE() {
    return this.#TYPE;
  }
}

export class LLMIntentionMessage {
  static #TYPE = "llmintention";

  type;
  intention;

  /**
   * @param {{intention: LLMIntention}} message
   */
  constructor({ intention }) {
    this.type = LLMIntentionMessage.TYPE;
    this.intention = intention;
  }

  static get TYPE() {
    return this.#TYPE;
  }
}

export class LLMIntentionTakenChargeMessage {
  static #TYPE = "llmintentiontakencharge";

  type;
  intention;

  /**
   * @param {{intention: LLMIntention}} message
   */
  constructor({ intention }) {
    this.type = LLMIntentionTakenChargeMessage.#TYPE;
    this.intention = intention;
  }

  static get TYPE() {
    return this.#TYPE;
  }
}

export class LLMSetIdMessage {
  static #TYPE = "llmsetId";

  type;
  llmAgentId;

  /**
   * @param {{llmAgentId: string}} llmAgentId
   */
  constructor({ llmAgentId }) {
    this.type = LLMSetIdMessage.#TYPE;
    this.llmAgentId = llmAgentId;
  }

  static get TYPE() {
    return this.#TYPE;
  }
}

export class LLMParametersTuningRequestMessage {
  static #TYPE = "llmparameterstuningrequest";

  currentParameters;
  type;

  /**
   * @param {{currentParameters: string}} currentParameters
   */
  constructor({ currentParameters }) {
    this.type = LLMParametersTuningRequestMessage.#TYPE;
    this.currentParameters = currentParameters;
  }


  static get TYPE() {
    return this.#TYPE;
  }
}

export class LLMParametersTuningResponseMessage {
  static #TYPE = "llmparameterstuningresponse";

  updatedParameters;
  type;

  /**
  * @param {{updatedParameters: LLMUpdatedParameters }} updatedParameters
  */
  constructor({ updatedParameters }) {
    this.type = LLMParametersTuningResponseMessage.#TYPE;
    this.updatedParameters = updatedParameters;
  }

  static get TYPE() {
    return this.#TYPE;
  }
}

export class LLMMapRequestMessage {
  static #TYPE = "llmmaprequest";
  type;

  constructor() {
    this.type = LLMMapRequestMessage.#TYPE;
  }

  static get TYPE() {
    return LLMMapRequestMessage.#TYPE;
  }
}

export class LLMMapResponseMessage {
  static #TYPE = "llmmapresponse";

  /**@type {string[][]}*/
  map;
  type;

  /**
   * 
   * @param {string[][]} map 
   */
  constructor(map) {
    this.map = map;
    this.type = LLMMapResponseMessage.#TYPE;
  }


  static get TYPE() {
    return LLMMapResponseMessage.#TYPE;
  }
}

export class LLMSetTileWeightMultiplierMessage {
  static #TYPE = "llmsettileweightmultiplier";

  type;
  coordinates;
  multiplierString;

  /**
   * @param {{coordinates: Coordinates[], multiplierString: string[]}} content
   */
  constructor({ coordinates, multiplierString }) {
    this.type = LLMSetTileWeightMultiplierMessage.#TYPE;
    this.coordinates = coordinates;
    this.multiplierString = multiplierString;
  }

  static get TYPE() {
    return this.#TYPE;
  }
}

export class BDIResponseMessage {
  static #TYPE = "bdiresponse";

  type;
  content;

  /**
   * @param {{content: string}} message
   */
  constructor({ content }) {
    this.type = BDIResponseMessage.#TYPE;
    this.content = content;
  }

  static get TYPE() {
    return this.#TYPE;
  }
}