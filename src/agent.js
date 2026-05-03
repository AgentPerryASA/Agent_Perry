/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */
/** @typedef Plan @type { import('./plan.js').Plan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

/**
 * MAP 25c1_8
 *AN: 
 
 In general: every time it seems stuck, executePath continuous to cycle
 
 A high penalty is assigned every time it tries to drop a parcel. Problem is less present if no red tile is next to another red tile. I notice that it happen GoPutDownPlan appear several times in the console: when it happens executePath is "stuck" (delete comment on console.log and see)

 sometimes pickup is emitted when in a white cell: the agent is immediately after a green cell. Other times emitpickup is executed on a red cell. This happen if a removeTile is emitted immediately before, meaning it does not find another path to go back. Removing the check for the return seems to solve at least this issue. Example:

 Emitted putdown
 Stopping  GoPutDownPlan { isStopped: false }
 exe  GoPickUpIntention {}
 Go from  Coordinates { x: 18, y: 16 } to Coordinates { x: 13, y: 14 }
 Remove  Coordinates { x: 13, y: 14 } from Coordinates { x: 18, y: 16 } [] 0
 emitted pickup
 Stopping  GoPickUpPlan { isStopped: false }
 exe  GoPickUpIntention {}
 Go from  Coordinates { x: 18, y: 16 } to Coordinates { x: 15, y: 14 }
 Remove  Coordinates { x: 15, y: 14 } from Coordinates { x: 18, y: 16 } [] 0
 emitted pickup

 Last thing: seems like it change parcel too frequently?

  Sometimes not the nearest red is chosen

 */

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

  /** @type {Beliefs} */
  #internalBelief;

  constructor() {
    this.#me = new Me('', '', new Coordinates(0, 0), 0);
    this.#planLibrary = [];
    this.#intentionList = new IntentionList();
    this.#internalBelief = new Beliefs();
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
    return this.#internalBelief;
  }

  init() {
    const promiseList = [];

    // Store relevant map configuration
    promiseList.push(new Promise(resolve => {
      this.#socket.onConfig(config => {
        this.#internalBelief.updateGameConfiguration(config)

        resolve(true);
      });
    }));

    // Store map structure and position of green and red tiles
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

    // Wait onConfig, onMap and onYou to receive the first event before starting the logic
    // The average parcel score, the tile map and the "me" info are required for the following classes and methods
    Promise.all(promiseList).then(async () => {
      this.#planLibrary.push(new GoToPlan(this));
      this.#planLibrary.push(new GoPickUpPlan(this));
      this.#planLibrary.push(new GoPutDownPlan(this));

      // In case of no changes in the environment, so no sensing events received
      this.#generateBestIntention();

      // Keep track of parcels around us
      this.#socket.onSensing(async sensing => {
        this.#internalBelief.reviseParcelList(sensing.parcels)
        this.#internalBelief.updateNearAgentList(sensing.agents)

        // Constantly generate the best intention based on our sensing
        await this.#generateBestIntention();
      });
    });
  }

  async #generateBestIntention() {
    this.#intentionList.clean();

    // Store the intention of delivering the parcels we are carrying
    // TODO: carriedParcelsCount does not listen to carried parcels that are expired
    if (this.#internalBelief.carriedParcelsCount >= 1) {
      for (const redTile of this.#internalBelief.tileMap.red) {
        this.#intentionList.goPutDown.push(new GoPutDownIntention(redTile));
      }
    }

    // Store the intentions of picking up all the free parcels around us
    for (const parcel of this.#internalBelief.parcelList) {
      const intention = new GoPickUpIntention(parcel.parcel);
      this.#intentionList.goPickUp.push(intention);
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

    // Best intention candidate: delivery parcels to the nearest red tile
    let minDistance = Number.MAX_VALUE;
    for (const intention of this.#intentionList.goPutDown) {
      const distance = this.#distance(intention.deliveryCoordinates, this.#me.coordinates);
      if (distance < minDistance) {
        minDistance = distance;
        bestIntention = intention;
      }
    }

    // NOTE: priority to delivery intention
    // TODO: go to pick up if a free parcel is along the path
    if (bestIntention) {
      //If bestintention is still putDown but the same is still executed, return null
      if(this.#currentPlan && this.#currentPlan instanceof GoPutDownPlan && this.#currentPlan.isRunning==true) {
        return
      }
      return bestIntention;
    }

    // Best intention candidate: pick up the free parcel with the highest score
    let highestScore = 0;
    for (const intention of this.#intentionList.goPickUp) {
      const parcelScore = intention.parcel.reward;
      if (parcelScore > highestScore && parcelScore >= this.#internalBelief.parcelMinScore) {
        for (let i = 0; i < this.#internalBelief.nearAgentList.length; i += 1) {
          let currentCheckedAgent = this.#internalBelief.nearAgentList[i]
          const x = currentCheckedAgent.x;
          const y = currentCheckedAgent.y;

          if (x !== undefined && y !== undefined) {
            let agentDst = this.#distance({ x, y }, intention.parcel);
            let myDst = this.#distance(this.#me.coordinates, intention.parcel)
            let dst = myDst - agentDst

            if (dst < 0) {
              //If the difference on distances is positive, this means another agent is nearer to the packet
              highestScore = parcelScore;
              bestIntention = intention;
            }
          }
        }
        if (this.#internalBelief.nearAgentList.length == 0) {
          //List could be empty: the package is the best on that case
          highestScore = parcelScore;
          bestIntention = intention;
        }
      }
    }

    if(bestIntention && this.#currentPlan && this.#currentPlan instanceof GoPickUpPlan && this.#currentPlan.isRunning==true) {
      //If it was already planning of picking up, then return with null
      return
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
    if (this.#currentIntention) {
      await this.#stopCurrentIntention();
      console.log("Stopping ", this.#currentPlan)

      // TODO: check if a new intention is selected
      // TODO: the check if the parcel is still free is not needed, a new intention will be generated next iteration

      this.#currentPlan = this.selectPlan(this.#currentIntention);
      if (this.#currentPlan) {
        console.log("exe ",this.#currentIntention)
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

  clean() {
    this.#goTo = [];
    this.#goPickUp = [];
    this.#goPutDown = [];
  }
}
