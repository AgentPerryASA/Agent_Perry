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
  /**@type {Parcel[]} */
  #carriedParcelList;
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
    this.#carriedParcelList = [];
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

  get carriedParcelList() {
    return this.#carriedParcelList;
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

  /**
   * @param {IOParcel[]} sensedParcelsList
   */
  reviseCarriedParcelList(sensedParcelsList) {
    // Assume that no parcel is dropped after being picked up, therefore, it is not possible to pickup a previously picked up parcel.
    // Notice that onSensing is triggered when the agent has a parcel, even if it is not moving
    const endTime = Date.now() + 0.01 * this.#carriedParcelList.length;

    let sensedParcelsMap = new Map();
    if (sensedParcelsList.length > 0) {
      //Filter only parcels carried by the agent itself
      for (let i = 0; i < sensedParcelsList.length; i += 1) {
        const p = sensedParcelsList[i];
        if (p.carriedBy && p.carriedBy == this.#id) {
          sensedParcelsMap.set(p.id, p);
        }
      }
    }

    for (let i = 0; i < this.#carriedParcelList.length; i += 1) {
      const currentParcelFromBelief = this.#carriedParcelList[i];
      const currentParcelFromSensedList = sensedParcelsMap.get(
        currentParcelFromBelief.parcel.id,
      );
      if (currentParcelFromSensedList != undefined) {
        // If parcel was already present in list, update its information
        currentParcelFromBelief.parcel = currentParcelFromSensedList;
        currentParcelFromBelief.lastUpdateTimestamp = endTime;
        currentParcelFromBelief.cumulatedTime +=
          (endTime - currentParcelFromBelief.lastUpdateTimestamp) / 1000;
        sensedParcelsMap.delete(currentParcelFromBelief.parcel.id);
      } else {
        // If parcel is not present in the sensed list, this means the agent no longer carries it,
        // therefore, it needs to be dropped from the list
        this.#carriedParcelList.splice(i);
        i -= 1;
      }
    }

    // Finally, add the new parcels that were picked up
    for (const [_, parcel] of sensedParcelsMap) {
      let newParcel = new Parcel(parcel, Date.now());
      this.#carriedParcelList.push(newParcel);
    }
  }
}
