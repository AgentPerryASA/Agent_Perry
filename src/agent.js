/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */
/** @typedef Plan @type { import('./plan.js').Plan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import 'dotenv/config';
import { Coordinates } from "./coordinates.js";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client/DjsConnect.js";
import { GoPickUpIntention, GoPutDownIntention, GoToIntention } from "./intention.js";
import { GoToPlan, GoPickUpPlan, GoPutDownPlan } from './plan.js';
import { Beliefs, TargetTile } from "./belief.js"

export class Agent {
  #socket;
  // TODO: TEO
  #me;
  #planLibrary;
  #intentionList;
  /** @type { {intention: Intention, plan: Plan}[] } */
  #intentionPlanQueue;
  // TODO: TEO
  /** @type { TargetTile | undefined } */
  #currentTargetTile;

  /** @type { Beliefs } */
  #internalBelief;

  constructor() {
    this.#me = new Me('', '', 0, new Coordinates(0, 0));
    this.#planLibrary = [GoToPlan, GoPickUpPlan, GoPutDownPlan];
    this.#intentionList = new IntentionList();
    this.#intentionPlanQueue = [];
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

  get #currentIntention() {
    const intentionPlan = this.#intentionPlanQueue[this.#intentionPlanQueue.length - 1];
    if (intentionPlan) {
      return intentionPlan.intention;
    }
  }

  get #currentPlan() {
    const intentionPlan = this.#intentionPlanQueue[this.#intentionPlanQueue.length - 1];
    if (intentionPlan) {
      return intentionPlan.plan;
    }
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
          if (this.#me.id == '') {
            this.#me = new Me(
              id,
              name,
              score,
              new Coordinates(x, y)
            );

            resolve(true);
          }
        }
      });
    }));

    // Wait onConfig, onMap and onYou to receive the first event before starting the logic
    // The average parcel score, the tile map and the "me" info are required for the following classes and methods
    Promise.all(promiseList).then(async () => {
      // Keep track of parcels around us
      this.#socket.onSensing(async sensing => {
        this.#internalBelief.reviseParcelList(sensing.parcels)
        this.#internalBelief.updateNearAgentList(sensing.agents)
      });

      // Constantly generate the best intention based on our sensing
      setInterval(async () => {
        await this.#generateBestIntention();
      }, 100)
    })
  }

  async #generateBestIntention() {
    const bestIntention = this.#selectBestIntention();

    if (bestIntention) {
      await this.#pushIntention(bestIntention);
    }
  }

  #selectBestIntention() {
    // TODO: DeviationIntention

    // As long as a GoPutDownIntention is running, no other intentions can be generated
    // (except for DeviationIntentions)
    if (this.#currentIntention && GoPutDownIntention.isTypeOf(this.#currentIntention)) {
      return;
    }

    // Check the intention of delivering the parcels we are carrying to a red tile according to its weight
    if (this.#internalBelief.carriedParcelsCount >= 1) {
      if (this.#currentTargetTile) {
        // Check if the current target tile is a green one (we just picked up a parcel)
        const currentGreenTile = this.#internalBelief.tileMap.getGreenTile(this.#currentTargetTile);
        if (currentGreenTile) {
          // Select a random path from the current green to a red
          const red = this.#selectRandomWeightedPath();
          if (red) {
            // Return best intention
            return new GoPutDownIntention(red.destinationCoordinates, red.path);
          }
        }
      }
    }

    // TODO: REMOVE
    if (this.#currentIntention && GoPickUpIntention.isTypeOf(this.#currentIntention)) {
      return;
    }

    // Check the intention of picking up the free parcel with the highest score
    let bestIntention;
    let highestScore = 0;
    for (const parcel of this.#internalBelief.parcelList) {
      const parcelScore = parcel.parcel.reward;
      if (parcelScore > highestScore && parcelScore >= this.#internalBelief.parcelMinScore) {
        highestScore = parcelScore;
        bestIntention = new GoPickUpIntention(parcel.parcel);
      }
    }
    if (bestIntention) {
      // Return best intention
      return bestIntention;
    }


    // As long as a GoToIntention is running, because we had no free parcels around us or in our memory,
    // do not generate other GoToIntentions
    // NOTE: GoToIntention generation cannot be allowed if the current one is already a GoToIntention
    //       because it would select a random green, and since it would be probably different from the
    //       current destination, it would push it as "new best intention"
    if (this.#currentIntention && GoToIntention.isTypeOf(this.#currentIntention)) {
      return;
    }

    // Check the intention of going to a green tile, if there are no free parcels around us or in our memeory
    // If we just delivered a parcel, select one of the predefined paths of the red tile ...
    if (this.#currentTargetTile) {
      // Check if the current target tile is a red one (we just put down a parcel)
      const currentRedTile = this.#internalBelief.tileMap.getRedTile(this.#currentTargetTile);
      if (currentRedTile) {
        // Select a random path from the current red to a green
        const green = this.#selectRandomWeightedPath();
        if (green) {
          return new GoToIntention(green.destinationCoordinates, green.path);
        }
      }
    }
    // ... otherwise select a random green tile
    const greenTilesCount = this.#internalBelief.tileMap.greenTiles.length;
    const randomTileIndex = Math.floor(Math.random() * greenTilesCount);
    const green = this.#internalBelief.tileMap.greenTiles[randomTileIndex];
    return new GoToIntention(green.coordinates);
  }

  /**
   * @param {Intention} intention 
   */
  async #pushIntention(intention) {
    // Skip push if the intention is already in the queue
    for (const intentionPlan of this.#intentionPlanQueue) {
      if (intentionPlan.intention.isEqual(intention)) {
        return;
      }
    }

    const plan = this.selectPlan(intention);
    // Skip push if no plan can satisfy the intention
    if (!plan) {
      return;
    }

    // Stop the current intention before pushing the new one
    await this.#stopCurrentIntention();

    this.#intentionPlanQueue.push({ intention: intention, plan: plan });

    console.log("new intetion: ", intention, this.#intentionPlanQueue.length)

    await this.#achieveCurrentIntention();
  }

  async #achieveCurrentIntention() {
    // NOTE: at this point, both currentIntention and currentPlan cannot be undefined
    const oldIntention = this.#currentIntention;
    // @ts-ignore
    const isCompleted = await this.#currentPlan.execute(this.#currentIntention);

    // @ts-ignore
    // Pop current intention-plan pair if the intention is achieved or, if it was stopped,
    // it was a GoToIntention (no need to be maintained in the queue)
    if (isCompleted || GoToIntention.isTypeOf(oldIntention)) {
      if (this.#currentIntention) {
        this.#assignCurrentTargetTile(this.#currentIntention);
      }

      const tmp = this.#currentIntention;
      this.#intentionPlanQueue.pop()
      console.log("POPPED ", tmp)

      if (this.#currentIntention) {
        // TODO: Resume
      }
    }
  }

  async #stopCurrentIntention() {
    if (this.#currentPlan) {
      await this.#currentPlan.stop();
      console.log("STOPPED ", this.#currentPlan)
    }
  }

  /**
   * @param {Intention} intention 
   */
  #assignCurrentTargetTile(intention) {
    if (GoPickUpIntention.isTypeOf(intention)) {
      const greenTile = this.#internalBelief.tileMap.getGreenTile(new TargetTile(intention.parcelCoordinates));
      if (greenTile) {
        this.#currentTargetTile = greenTile;
      }
    }

    if (GoPutDownIntention.isTypeOf(intention)) {
      const redTile = this.#internalBelief.tileMap.getRedTile(new TargetTile(intention.deliveryCoordinates));
      if (redTile) {
        this.#currentTargetTile = redTile;
      }
    }
  }

  #selectRandomWeightedPath() {
    if (!this.#currentTargetTile) {
      return;
    }

    const totalWeight = [...this.#currentTargetTile.pathList.values()]
      .reduce((sum, weightedPath) => sum + weightedPath.weight, 0);

    let random = Math.random() * totalWeight;

    for (const [destinationCoordinates, weightedPath] of this.#currentTargetTile.pathList) {
      random -= weightedPath.weight;

      if (random < 0) {
        return { destinationCoordinates: destinationCoordinates, path: weightedPath.path };
      }
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
        return new plan(this);
      }
    }
  }
}

export class Me {
  #id;
  #name;
  #score;
  coordinates;

  /**
   * @param {string} id 
   * @param {string} name 
   * @param {number} score 
   * @param {Coordinates} coordinates 
   */
  constructor(id, name, score, coordinates) {
    this.#id = id;
    this.#name = name;
    this.#score = score;
    this.coordinates = coordinates;
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
}

class IntentionList {
  /** @type { GoToIntention[] } */
  #goTo;
  /** @type { GoPickUpIntention[] } */
  #goPickUp;
  /** @type { GoPutDownIntention | undefined } */
  goPutDown;

  constructor() {
    this.#goTo = [];
    this.#goPickUp = [];
  }

  get goTo() {
    return this.#goTo;
  }

  get goPickUp() {
    return this.#goPickUp;
  }

  clean() {
    this.#goTo = [];
    this.#goPickUp = [];
    this.goPutDown = undefined;
  }
}
