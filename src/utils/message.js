/** @typedef Message @type { HandshakeMessage | LLMIntentionMessage | LLMIntentionTakenChargeMessage | BDIResponseMessage | LLMSetIdMessage | LLMParametersTuningResponseMessage} */
/** @typedef LLMIntention @type {import("../llm_intention.js").LLMIntention} */

import { LLMUpdatedParameters } from "./beliefs_utils.js";

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
    return HandshakeMessage.#TYPE;
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
    return LLMIntentionMessage.#TYPE;
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
    return LLMIntentionTakenChargeMessage.#TYPE;
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
    return LLMSetIdMessage.#TYPE;
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
    return LLMParametersTuningRequestMessage.#TYPE;
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
    return LLMParametersTuningResponseMessage.#TYPE;
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
    return BDIResponseMessage.#TYPE;
  }
}