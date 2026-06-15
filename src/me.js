/** @typedef IOParcel @type {import("@unitn-asa/deliveroo-js-sdk").IOParcel}} */
/**@typedef IOAgent @type {import("@unitn-asa/deliveroo-js-sdk").IOAgent} */

import { Parcel } from "./utils/beliefs_utils.js";
import { Coordinates } from "./utils/coordinates.js";

export class Me {
  /**@type {string} */
  #id;
  /**@type {string} */
  #name;
  /**@type {number} */
  #score;
  /**@type {number} */
  #penalty;
  /**@type {Coordinates} */
  #coordinates;
  /**@type {Map<string,IOParcel | undefined>}*/
  #carriedParcelsMap;
  /**@type {string} */
  #mateId;
  /**@type {string}*/
  #llmId;
  /**@type {number}*/
  #agentMovementDelay;

  /**
   * @param {string} id
   * @param {string} name
   * @param {number} score
   * @param {number} penalty
   * @param {Coordinates} coordinates
   */
  constructor(id, name, score, penalty, coordinates) {
    this.#id = id;
    this.#name = name;
    this.#score = score;
    this.#penalty = penalty;
    this.#coordinates = coordinates;
    this.#carriedParcelsMap = new Map();
    this.#mateId = "";
    this.#llmId = "";
    this.#agentMovementDelay = 0;
  }

  get id() {
    return this.#id;
  }

  get name() {
    return this.#name;
  }

  get score() {
    return this.#score;
  }

  get penalty() {
    return this.#penalty;
  }

  get coordinates() {
    return this.#coordinates;
  }

  get mateId() {
    return this.#mateId;
  }

  get llmId() {
    return this.#llmId;
  }

  get agentMovementDelay() {
    return this.#agentMovementDelay;
  }

  get carriedParcelsCount() {
    return this.#carriedParcelsMap.size;
  }

  get carriedParcelsMap() {
    return this.#carriedParcelsMap;
  }

  set coordinates(c) {
    this.#coordinates = c;
  }

  set mateId(value) {
    if (!this.#mateId) {
      this.#mateId = value;
    }
  }

  set llmId(value) {
    this.#llmId = value;
  }

  set agentMovementDelay(value) {
    this.#agentMovementDelay = value;
  }

  /**
   * 
   * @param {IOAgent} agent 
   */
  updateMe(agent) {
    this.#id = agent.id;
    this.#name = agent.name;
    this.#score = agent.score;
    this.#penalty = agent.penalty;
  }

}
