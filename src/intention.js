/** @typedef Intention @type { GoToIntention | GoPickUpIntention | GoPutDownIntention | DeviateIntention | DeviateAndPickUpIntention } */
/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */

import { Coordinates } from "./coordinates.js";
import { MapPoint } from "./path_finder.js";

export class GoToIntention {
  #destinationCoordinates;
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

export class DeviateIntention {
  #parcel;
  #parcelCoordinates;
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

export class DeviateAndPickUpIntention {
  #parcel;
  #parcelCoordinates;
  #returnCoordinates;

  /**
   * @param {IOParcel} parcel
   * @param {Coordinates} returnCoordinates
   */
  constructor(parcel, returnCoordinates) {
    this.#parcel = parcel;
    this.#parcelCoordinates = new Coordinates(parcel.x, parcel.y);
    this.#returnCoordinates = returnCoordinates;
  }

  get parcelCoordinates() {
    return this.#parcelCoordinates;
  }

  get parcel() {
    return this.#parcel;
  }

  get returnCoordinates() {
    return this.#returnCoordinates;
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
