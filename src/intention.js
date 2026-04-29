/** @typedef Intention @type { GoToIntention | GoPickUpIntention | GoPutDownIntention } */
/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */

import { Coordinates } from "./coordinates.js";

export class GoToIntention {
  #destinationCoordinates;

  /**
   * @param {Coordinates} destinationCoordinates
   */
  constructor(destinationCoordinates) {
    this.#destinationCoordinates = destinationCoordinates;
  }

  get destinationCoordinates() {
    return this.#destinationCoordinates;
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

export class GoPickUpIntention {
  #parcel;
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
  #deliveryCoordinates;

  /**
   * @param {Coordinates} deliveryCoordinates
   */
  constructor(deliveryCoordinates) {
    this.#deliveryCoordinates = deliveryCoordinates;
  }

  get deliveryCoordinates() {
    return this.#deliveryCoordinates;
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
