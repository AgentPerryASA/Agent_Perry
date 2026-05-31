/** @typedef Message @type { HandshakeMessage | LLMIntentionMessage | LLMIntentionTakenChargeMessage | BDIResponseMessage } */
/** @typedef LLMIntention @type {import("./llm_intention.js").LLMIntention} */

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
  static #TYPE = "llmintention"

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
  static #TYPE = "llmintentiontakencharge"

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

export class BDIResponseMessage {
  static #TYPE = "bdiresponse"

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
