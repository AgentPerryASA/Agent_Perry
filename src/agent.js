/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */
/** @typedef Plan @type { import('./plan.js').Plan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import 'dotenv/config';
import { Coordinates } from "./coordinates.js";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client/DjsConnect.js";
import { GoPickUpIntention, GoPutDownIntention, GoToIntention } from "./intention.js";
import { GoToPlan, GoPickUpPlan, GoPutDownPlan } from './plan.js';
import { Beliefs } from "./belief.js"

export class Agent {
  #socket;
  #me;
  /** @type { Plan[] } */
  #planLibrary;
  #intentionList;
  /** @type { Intention | undefined } */
  #currentIntention;
  /** @type {Plan | undefined} */
  #currentPlan;
  carriedParcelsCount;

  /** @type {Beliefs} */
  #internalBelief;

  constructor() {
    this.#me = new Me('', '', new Coordinates(0, 0), 0);
    this.#planLibrary = [];
    this.#intentionList = new IntentionList();
    this.#internalBelief = new Beliefs()
    this.carriedParcelsCount = 0;

    this.#socket = DjsConnect();

    this.init();
  }

  get socket() {
    return this.#socket;
  }

  get me() {
    return this.#me;
  }

  get internalBelief() {
    return this.#internalBelief
  }

  init() {
    const promiseList = [];

    // Keep track of green and red tiles coordinates
    promiseList.push(new Promise(resolve => {
      this.#socket.onMap((w, h, tiles) => {
        this.#internalBelief.updateTileMap(tiles);

        resolve(true);
      });
    }));

    // Keep track of agent information
    promiseList.push(new Promise(resolve => {
      this.#socket.onYou(async ({ id, name, x, y, score }) => {
        // Skip intermediate values (0.6 or 0.4)
        if ((x != undefined && x % 1 == 0) && (y != undefined && y % 1 == 0)) {
          this.#me = new Me(
            id,
            name,
            new Coordinates(x, y),
            score
          );
          resolve(true);
        }

      });
    }));

    // Wait onMap and onYou to receive the first event before starting the logic
    // The tile map and the "me" info are required for the following classes and methods
    Promise.all(promiseList).then(async () => {
      this.#planLibrary.push(new GoToPlan(this));
      this.#planLibrary.push(new GoPickUpPlan(this));
      this.#planLibrary.push(new GoPutDownPlan(this));

      // In case of no changes in the environment, so no sensing events received
      this.#generateBestIntention();

      // Keep track of parcels around us
      this.#socket.onSensing(async sensing => {
        this.#internalBelief.reviseParcelList(sensing.parcels)

        // Constantly generate the best intention based on our sensing
        await this.#generateBestIntention();
      });
    });
  }

  async #generateBestIntention() {
    this.#intentionList.clear();

    // Store the intention of delivering the parcels we are carrying
    // TODO: carriedParcelsCount does not listen to carried parcels that are expired
    if (this.carriedParcelsCount >= 1) {
      for (const redTile of this.#internalBelief.tileMap.red) {
        this.#intentionList.goPutDown.push(new GoPutDownIntention(redTile));
      }
    }

    // Store the intentions of picking up all the free parcels around us
    for (const parcel of this.#internalBelief.parcelList) {
      if (!parcel.parcel.carriedBy) {
        const intention = new GoPickUpIntention(parcel.parcel);
        this.#intentionList.goPickUp.push(intention);
      }
    }

    // Store the intentions of going to green tiles, if the are no free parcels around us
    if (this.#internalBelief.parcelList.length == 0) {
      for (const greenTile of this.#internalBelief.tileMap.green) {
        this.#intentionList.goTo.push(new GoToIntention(greenTile));
      }
    }

    const bestIntention = this.#selectBestIntention();

    // Push the best intention for revision
    if (bestIntention) {
      await this.#pushIntention(bestIntention);
    }
  }

  #selectBestIntention() {
    let bestIntention;
    let minDistance = Number.MAX_VALUE;

    // Best intention candidate: delivery parcels to the nearest red tile
    for (const intention of this.#intentionList.goPutDown) {
      const distance = this.#distance(intention.deliveryCoordinates, this.#me.coordinates);
      if (distance < minDistance) {
        minDistance = distance;
        bestIntention = intention;
      }
    }

    // NOTE: priority to delivery intention
    if (bestIntention) {
      return bestIntention;
    }

    // Best intention candidate: pick up the nearest free parcel
    minDistance = Number.MAX_VALUE;
    for (const intention of this.#intentionList.goPickUp) {
      const distance = this.#distance(intention.parcelCoordinates, this.#me.coordinates);
      if (distance < minDistance) {
        minDistance = distance;
        bestIntention = intention;
      }
    }

    // Best intention candidate: go to the nearest green tile, if we have not green tiles around us
    if (!bestIntention) {
      for (const intention of this.#intentionList.goTo) {
        const distance = this.#distance(intention.destinationCoordinates, this.#me.coordinates);
        if (distance < minDistance) {
          minDistance = distance;
          bestIntention = intention;
        }
      }
    }

    return bestIntention;
  }

  /**
   * 
   * @param {Intention} intention 
   */
  async #pushIntention(intention) {
    // Skip push if the intention remains the same
    if (this.#currentIntention && this.#currentIntention.isEqual(intention)) {
      return;
    }

    this.#currentIntention = intention;

    await this.#achieveCurrentIntention();
  }

  async #achieveCurrentIntention() {
    // TODO: check validity

    if (this.#currentIntention) {
      await this.#stopCurrentIntention();

      this.#currentPlan = this.selectPlan(this.#currentIntention);
      if (this.#currentPlan) {
        // @ts-ignore
        this.#currentPlan.execute(this.#currentIntention);
      }
    }
  }

  async #stopCurrentIntention() {
    if (this.#currentPlan) {
      await this.#currentPlan.stop();
    }
  }

  /** @type { function ({x:number, y:number}, {x:number, y:number}): number } */
  #distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2))
    const dy = Math.abs(Math.round(y1) - Math.round(y2))
    return dx + dy;
  }

  /**
   * @param {Intention} intention 
   */
  selectPlan(intention) {
    for (const plan of this.#planLibrary) {
      if (plan.isApplicable(intention)) {
        return plan;
      }
    }
  }
}

export class Me {
  #id;
  #name;
  #coordinates;
  #score;

  /**
   * Constructor of Me
   * @param {string} id 
   * @param {string} name 
   * @param {Coordinates} coordinates 
   * @param {number} score 
   */
  constructor(id, name, coordinates, score) {
    this.#id = id;
    this.#name = name;
    this.#coordinates = coordinates;
    this.#score = score;
  }

  get id() {
    return this.#id;
  }

  get name() {
    return this.#name;
  }

  get coordinates() {
    return this.#coordinates;
  }

  get score() {
    return this.#score;
  }
}

class IntentionList {
  /** @type { GoToIntention[] } */
  #goTo;
  /** @type { GoPickUpIntention[] } */
  #goPickUp;
  /** @type { GoPutDownIntention[] } */
  #goPutDown;

  constructor() {
    this.#goTo = [];
    this.#goPickUp = [];
    this.#goPutDown = [];
  }

  get goTo() {
    return this.#goTo;
  }

  get goPickUp() {
    return this.#goPickUp;
  }

  get goPutDown() {
    return this.#goPutDown;
  }

  clear() {
    this.#goTo = [];
    this.#goPickUp = [];
    this.#goPutDown = [];
  }
}
