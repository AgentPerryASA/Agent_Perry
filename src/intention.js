/** @typedef Intention @type { GoToIntention | GoPickUpIntention | GoPutDownIntention | DeviateAndPickUpIntention | DeviateUsingPlannerIntention | DeviateUsingAStarIntention} */
/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */

import { Coordinates } from "./utils/coordinates.js";
import { MapPoint } from "./utils/path_utils.js";
import { LLMIntention } from "./llm_intention.js";

export class GoToIntention {
  /**@type {Coordinates} */
  #destinationCoordinates;
  /**@type {MapPoint[] | undefined} */
  #path;

  /**
   * @param {Coordinates} destinationCoordinates
   * @param {MapPoint[] | undefined} path
   */
  constructor(destinationCoordinates, path = undefined) {
    this.#destinationCoordinates = destinationCoordinates;
    this.#path = path;
  }

  get destinationCoordinates() {
    return this.#destinationCoordinates;
  }

  get path() {
    return this.#path;
  }

  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {
    // NOTE: destinationCoordinates attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.#destinationCoordinates.isEqual(intention.destinationCoordinates);
  }

  /**
   * @param {Intention | LLMIntention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}

export class DeviateUsingPlannerIntention {
  /**@type {MapPoint[]} */
  #currentPath;
  /**@type {Number}*/
  #stopPointIndexInPath;

  /**
   * @param {MapPoint[]} currentPath 
   * @param {Number} stopPointIndexInPath
   */
  constructor(currentPath, stopPointIndexInPath) {
    this.#currentPath = currentPath;
    this.#stopPointIndexInPath = stopPointIndexInPath;
  }

  get currentPath() {
    return this.#currentPath;
  }

  get stopPointIndexInPath() {
    return this.#stopPointIndexInPath;
  }

  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {

    const instance = intention instanceof this.constructor;
    let arePathEqual = false;
    if (instance) {

      arePathEqual = /** @type {DeviateUsingPlannerIntention} */ (intention).currentPath.length == this.#currentPath.length;

      if (arePathEqual) {
        const intentionPath = /** @type {DeviateUsingPlannerIntention} */ (intention).currentPath;
        const currentPath = this.#currentPath;
        for (let i = 0; i < this.#currentPath.length; i += 1) {
          if (currentPath[i].x != intentionPath[i].x || currentPath[i].y != intentionPath[i].y) {
            arePathEqual = false;
            break;
          }
        }
      }
    }

    return instance && arePathEqual;

  }

  /**
   * @param {Intention | LLMIntention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }

}

export class DeviateUsingAStarIntention {

  /**@type {Coordinates}*/
  #endPointCoordinates;
  /**@type {MapPoint[]}*/
  #blockPoints;
  /**@type {Coordinates | undefined} */
  #startPointCoordinates;

  /**
   * @param {Coordinates} endPointCoordinates 
   * @param {MapPoint[]} blockPoints s
   * @param {Coordinates | undefined} startPointCoordinates
   */
  constructor(endPointCoordinates, blockPoints, startPointCoordinates = undefined) {
    this.#endPointCoordinates = endPointCoordinates;
    this.#blockPoints = blockPoints;
    this.#startPointCoordinates = startPointCoordinates;
  }

  get endPointCoordinates() {
    return this.#endPointCoordinates;
  }

  get blockPoints() {
    return this.#blockPoints;
  }

  get startPointCoordinates() {
    return this.#startPointCoordinates;
  }

  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {
    const instance = intention instanceof this.constructor;
    let doCoordinatesMatch = false;

    if (instance) {
      const inte = /**@type {DeviateUsingAStarIntention}*/(intention);

      doCoordinatesMatch = inte.#endPointCoordinates.x == this.#endPointCoordinates.x && inte.#endPointCoordinates.y == this.#endPointCoordinates.y;

      if (doCoordinatesMatch && this.#blockPoints.length == inte.blockPoints.length) {
        for (let i = 0; i < this.#blockPoints.length; i += 1) {
          if (this.#blockPoints[i].x != inte.blockPoints[i].x || this.#blockPoints[i].y != inte.blockPoints[i].y) {
            doCoordinatesMatch = false;
            break;
          }
        }
      } else {
        doCoordinatesMatch = false;
      }

    }

    return instance && doCoordinatesMatch;
  }

  /**
   * @param {Intention | LLMIntention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }

}

export class GoPickUpIntention {
  /**@type {IOParcel}*/
  #parcel;
  /**@type {Coordinates}*/
  #parcelCoordinates;

  /**
   * @param {IOParcel} parcel
   */
  constructor(parcel) {
    this.#parcel = parcel;
    this.#parcelCoordinates = new Coordinates(parcel.x, parcel.y);
  }

  get parcelCoordinates() {
    return this.#parcelCoordinates;
  }

  get parcel() {
    return this.#parcel;
  }

  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {
    // NOTE: parcel attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.#parcel.id == intention.parcel.id;
  }

  /**
   * @param {Intention | LLMIntention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}

export class GoPutDownIntention {
  /**@type {Coordinates}*/
  #deliveryCoordinates;
  /**@type {MapPoint[] | undefined}*/
  #path;

  /**
   * @param {Coordinates} deliveryCoordinates
   * @param {MapPoint[] | undefined} path 
   */
  constructor(deliveryCoordinates, path) {
    this.#deliveryCoordinates = deliveryCoordinates;
    this.#path = path;
  }

  get deliveryCoordinates() {
    return this.#deliveryCoordinates;
  }

  set deliveryCoordinates(value) {
    this.#deliveryCoordinates = value;
    this.#path = undefined;
  }

  get path() {
    return this.#path;
  }

  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {
    // NOTE: deliveryCoordinates attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.#deliveryCoordinates.isEqual(intention.deliveryCoordinates);
  }

  /**
   * @param {Intention | LLMIntention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}

export class DeviateAndPickUpIntention {
  /**@type {IOParcel} */
  #parcel;
  /**@type {Coordinates}*/
  #parcelCoordinates;
  /**@type {Coordinates}*/
  #targetCoordinates;

  /**
   * @param {IOParcel} parcel 
   * @param {Coordinates} targetCoordinates 
   */
  constructor(parcel, targetCoordinates) {
    this.#parcel = parcel;
    this.#parcelCoordinates = new Coordinates(parcel.x, parcel.y);
    this.#targetCoordinates = targetCoordinates;
  }

  get parcel() {
    return this.#parcel;
  }

  get parcelCoordinates() {
    return this.#parcelCoordinates;
  }

  get targetCoordinates() {
    return this.#targetCoordinates;
  }

  /**
   * @param {LLMIntention | Intention} intention
   */
  isEqual(intention) {
    // NOTE: parcel attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.#parcel.id == intention.parcel.id;
  }

  /**
   * @param {Intention | LLMIntention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}
