/** @typedef Message @type { HandshakeMessage | LLMSetIdMessage | LLMParametersTuningResponseMessage | LLMMapRequestMessage | LLMMapResponseMessage | LLMGreenLightEmittedMessage } */
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

export class LLMSetIdMessage {
  static #TYPE = "llmSetId";

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
  static #TYPE = "llmParametersTuningRequest";

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
  static #TYPE = "llmParametersTuningTesponse";

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
  static #TYPE = "llmMapRequest";
  type;

  constructor() {
    this.type = LLMMapRequestMessage.#TYPE;
  }

  static get TYPE() {
    return this.#TYPE;
  }
}

export class LLMMapResponseMessage {
  static #TYPE = "llmMapResponse";

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
    return this.#TYPE;
  }
}

export class LLMSetTileWeightMultiplierMessage {
  static #TYPE = "llmSetTileWeightMultiplier";

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

export class LLMGreenLightEmittedMessage {
  static #TYPE = "llmGreenLightEmitted";

  type;

  constructor() {
    this.type = LLMGreenLightEmittedMessage.#TYPE;
  }

  static get TYPE() {
    return this.#TYPE;
  }
}
