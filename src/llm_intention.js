/** @typedef Intention @type { import("./intention.js").Intention } */

import { Coordinates } from "./utils/coordinates.js";

export class LLMIntention {
  /**
   * @param {LLMIntention | Intention} intention
   */
  sender;

  /**@param {string} sender*/
  constructor(sender) {
    this.sender = sender;
  }

  /**@param {LLMIntention | Intention} intention */
  isEqual(intention) {
    return intention instanceof this.constructor;
  }

  /**
   * @param {LLMIntention | Intention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}

export class LLMGoPutDownIntention extends LLMIntention {
  static #TYPE = "goPutDown";

  type;
  value;
  deliveryCoordinates;

  /**
   * @param {Coordinates} deliveryCoordinates 
   * @param {string} value
   * @param {string} sender
   */
  constructor(deliveryCoordinates, value, sender) {
    super(sender);
    this.type = LLMGoPutDownIntention.#TYPE;
    this.value = value;
    this.deliveryCoordinates = deliveryCoordinates;
  }

  static get TYPE() {
    return this.#TYPE;
  }

  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {
    // NOTE: destinationCoordinates attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.destinationCoordinates.isEqual(intention.destinationCoordinates);
  }

  /**
   * @param {LLMIntention | Intention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}

export class LLMGoToIntention extends LLMIntention {
  static #TYPE = "goTo";

  type;
  value;
  destinationCoordinates;

  /**
   * @param {Coordinates} destinationCoordinates
   * @param {string} value
   * @param {string} sender
   */
  constructor(destinationCoordinates, value, sender) {
    super(sender);
    this.type = LLMGoToIntention.#TYPE;
    this.value = value;
    this.destinationCoordinates = destinationCoordinates;
  }

  static get TYPE() {
    return this.#TYPE;
  }

  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {
    // NOTE: destinationCoordinates attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.destinationCoordinates.isEqual(intention.destinationCoordinates);
  }

  /**
   * @param {LLMIntention | Intention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}

export class LLMGreenRedLightIntention extends LLMIntention {
  static #TYPE = "greenRedLight";

  type;
  destinationCoordinates;

  /**
   * @param {Coordinates} destinationCoordinates 
   * @param {string} sender
   */
  constructor(destinationCoordinates, sender) {
    super(sender);
    this.type = LLMGreenRedLightIntention.#TYPE;
    this.destinationCoordinates = destinationCoordinates;
  }

  static get TYPE() {
    return this.#TYPE;
  }

  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {
    // NOTE: destinationCoordinates attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.destinationCoordinates.isEqual(intention.destinationCoordinates);
  }

  /**
   * @param {LLMIntention | Intention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}
