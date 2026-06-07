/** @typedef Intention @type { import("./intention.js").Intention } */

import { Coordinates } from "./utils/coordinates.js";

export class LLMIntention {
  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {
    // @ts-ignore
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
  deliveryCoordinates;

  /**
   * @param {Coordinates} deliveryCoordinates 
   */
  constructor(deliveryCoordinates) {
    super();
    this.type = LLMGoPutDownIntention.#TYPE;
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
  destinationCoordinates;

  /**
   * @param {Coordinates} destinationCoordinates 
   */
  constructor(destinationCoordinates) {
    super();
    this.type = LLMGoToIntention.#TYPE;
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
  destination;
  destinationCoordinates;

  /**
   * @param {{parity: string, type:string}} destination 
   * @param {Coordinates | undefined} destinationCoordinates 
   */
  constructor(destination, destinationCoordinates = undefined) {
    super();
    this.type = LLMGreenRedLightIntention.#TYPE;
    this.destination = destination;
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
