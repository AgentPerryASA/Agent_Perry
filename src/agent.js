/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */
/** @typedef Plan @type { import('./plan.js').Plan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import 'dotenv/config';
import { Coordinates } from "./coordinates.js";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client/DjsConnect.js";
import { GoPickUpIntention, GoPutDownIntention, GoToIntention } from "./intention.js";
import { GoToPlan, GoPickUpPlan, GoPutDownPlan } from './plan.js';

export class Agent {
  // TODO: put them in beliefe
  /** @type { Map<string, IOParcel> } */
  #parcelMap = new Map();
  #tileMap = {
    /** @type { Coordinates[] } */
    green: [],
    /** @type { Coordinates[] } */
    red: []
  }

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

  constructor() {
    this.#me = new Me('', '', new Coordinates(0, 0), 0);
    this.#planLibrary = [];
    this.#planLibrary.push(new GoToPlan(this));
    this.#planLibrary.push(new GoPickUpPlan(this));
    this.#planLibrary.push(new GoPutDownPlan(this));
    this.#intentionList = new IntentionList();
    this.carriedParcelsCount = 0;

    this.#socket = DjsConnect();

    const promiseList = this.#startOnSensing();
    Promise.all(promiseList).then(async () => {
      // TODO: useless
      // this.#planLibrary.push(new GoToPlan(this));
      // this.#planLibrary.push(new GoPickUpPlan(this));
    })
  }

  get socket() {
    return this.#socket;
  }

  get me() {
    return this.#me;
  }

  #startOnSensing() {
    const promiseList = [];

    // Keep track of green and red tiles coordinates
    promiseList.push(new Promise(resolve => {
      this.#socket.onMap((w, h, tiles) => {
        for (let i = 0; i < tiles.length; i++) {
          const coordinates = new Coordinates(tiles[i].x, tiles[i].y)
          if (tiles[i].type == '1') {
            this.#tileMap.green.push(coordinates);
          } else if (tiles[i].type == '2') {
            this.#tileMap.red.push(coordinates);
          }
        }

        resolve(true);
      });
    }));

    // Keep track of agent information
    promiseList.push(new Promise(resolve => {
      this.#socket.onYou(({ id, name, x, y, score }) => {
        this.#me = new Me(
          id,
          name,
          // TODO: round to int
          new Coordinates(x ? x : -1, y ? y : -1),
          score
        );

        resolve(true);
      });
    }));

    // Keep track of parcels around us
    promiseList.push(new Promise(resolve => {
      this.#socket.onSensing(async sensing => {
        for (const parcel of sensing.parcels) {
          this.#parcelMap.set(parcel.id, parcel);
        }

        for (const parcel of this.#parcelMap.values()) {
          if (sensing.parcels.map(p => p.id).find(id => id == parcel.id) == undefined) {
            this.#parcelMap.delete(parcel.id);
          }
        }

        // Constantly generate the best intention based on our sensing
        await this.#generateBestIntention();

        resolve(true);
      });
    }));

    return promiseList;
  }

  async #generateBestIntention() {
    this.#intentionList.clear();

    // Store the intention of delivering the parcels we are carrying
    // TODO: carriedParcelsCount does not listen to carried parcels that are expired
    if (this.carriedParcelsCount >= 1) {
      for (const redTile of this.#tileMap.red) {
        this.#intentionList.goPutDown.push(new GoPutDownIntention(redTile));
      }
    }

    // Store the intentions of picking up all the free parcels around us
    for (const parcel of this.#parcelMap.values()) {
      if (!parcel.carriedBy) {
        const intention = new GoPickUpIntention(parcel);
        this.#intentionList.goPickUp.push(intention);
      }
    }
    // Store the intentions of going to green tiles, if the are no free parcels around us
    if (this.#parcelMap.size == 0) {
      for (const greenTile of this.#tileMap.green) {
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
