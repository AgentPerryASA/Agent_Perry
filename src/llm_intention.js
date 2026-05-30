/** @typedef LLMIntention @type {LLMGoToIntention} */

import { Coordinates } from "./coordinates";

export class LLMGoToIntention {
  static #TYPE = "goTo"

  #destinationCoordinates;

  /**
   * @param {Coordinates} destinationCoordinates 
   */
  constructor(destinationCoordinates) {
    this.#destinationCoordinates = destinationCoordinates;
  }

  static get TYPE() {
    return LLMGoToIntention.#TYPE;
  }

  get destinationCoordinates() {
    return this.#destinationCoordinates
  }

  /**
   * @param {string} Input 
   */
  static parseInput(Input) {
    // TODO: from (x, y) to Coordinates(x, y)
    return new Coordinates(0, 0);
  }

  /**
   * @param {LLMIntention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}