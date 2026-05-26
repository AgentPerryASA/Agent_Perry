/** @typedef Intention @type { GoToIntention | GoPickUpIntention | GoPutDownIntention | DeviateAndPickUpIntention | DeviateUsingPlannerIntention | DeviateUsingAStarIntention} */
/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */

import { Beliefset } from "@unitn-asa/pddl-client";
import { Coordinates } from "./coordinates.js";
import { MapPoint, PathFinder } from "./path_finder.js";

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
   * @param {Intention} intention
   */
  isEqual(intention) {
    // NOTE: destinationCoordinates attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.#destinationCoordinates.isEqual(intention.destinationCoordinates);
  }

  /**
   * @param {Intention} intention 
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
   * @param {Intention} intention
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
   * @param {Intention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }

}

export class DeviateUsingAStarIntention {

  /**@type {Coordinates}*/
  #endPointCoordinates;
  /**@type {MapPoint}*/
  #blockPoint;

  /**
   * @param {Coordinates} endPointCoordinates 
   * @param {MapPoint} blockPoint 
   */
  constructor(endPointCoordinates, blockPoint) {
    this.#endPointCoordinates = endPointCoordinates;
    this.#blockPoint = blockPoint;
  }

  get endPointCoordinates() {
    return this.#endPointCoordinates;
  }

  get blockPoint() {
    return this.#blockPoint;
  }

  /**
   * @param {Intention} intention
   */
  isEqual(intention) {
    const instance = intention instanceof this.constructor;
    let doCoordinatesMatch = false;

    if (instance) {
      const i = /**@type {DeviateUsingAStarIntention}*/(intention);

      doCoordinatesMatch = i.blockPoint.x == this.#blockPoint.x && i.blockPoint.y == this.#blockPoint.y && i.#endPointCoordinates.x == this.#endPointCoordinates.x && i.#endPointCoordinates.y == this.#endPointCoordinates.y;
    }

    return instance && doCoordinatesMatch;
  }

  /**
   * @param {Intention} intention 
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
   * @param {Intention} intention
   */
  isEqual(intention) {
    // NOTE: parcel attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.#parcel.id == intention.parcel.id;
  }

  /**
   * @param {Intention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}

export class GoPutDownIntention {
  /**@type {Coordinates}*/
  #deliveryCoordinates;
  /**@type {MapPoint[]}*/
  #path;

  /**
   * @param {Coordinates} deliveryCoordinates
   * @param {MapPoint[]} path 
   */
  constructor(deliveryCoordinates, path) {
    this.#deliveryCoordinates = deliveryCoordinates;
    this.#path = path;
  }

  get deliveryCoordinates() {
    return this.#deliveryCoordinates;
  }

  get path() {
    return this.#path;
  }

  /**
   * @param {Intention} intention
   */
  isEqual(intention) {
    // NOTE: deliveryCoordinates attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.#deliveryCoordinates.isEqual(intention.deliveryCoordinates);
  }

  /**
   * @param {Intention} intention 
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
   * @param {Intention} intention
   */
  isEqual(intention) {
    // NOTE: parcel attribute in intention if first condition true, so safe check
    // @ts-ignore
    return intention instanceof this.constructor && this.#parcel.id == intention.parcel.id;
  }

  /**
   * @param {Intention} intention 
   */
  static isTypeOf(intention) {
    return intention instanceof this;
  }
}
