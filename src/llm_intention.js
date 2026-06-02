/** @typedef LLMIntention @type {LLMGoToIntention} */

import { Coordinates } from "./utils/coordinates.js";

export class LLMGoToIntention {
  static #TYPE = "goTo";

  type;
  destinationCoordinates;

  /**
   * @param {Coordinates} destinationCoordinates 
   */
  constructor(destinationCoordinates) {
    this.type = LLMGoToIntention.#TYPE;
    this.destinationCoordinates = destinationCoordinates;
  }

  static get TYPE() {
    return LLMGoToIntention.#TYPE;
  }

  /**
   * @param {string} Input 
   */
  static parseInput(Input) {
    // TODO: from (x, y) to Coordinates(x, y)
    return new Coordinates(0, 0);
  }
}