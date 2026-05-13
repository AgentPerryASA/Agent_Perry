/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */
/** @typedef Plan @type { import('./plan.js').Plan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import 'dotenv/config';
import { Coordinates } from "./coordinates.js";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client/DjsConnect.js";
import { GoPickUpIntention, GoPutDownIntention, GoToIntention } from "./intention.js";
import { GoToPlan, GoPickUpPlan, GoPutDownPlan } from './plan.js';
import { Beliefs, TargetTile } from "./belief.js"
import { PathFinder } from './path_finder.js';

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

        // Constantly generate the best intention based on our sensing
        // await this.#generateBestIntention();
      });

      setInterval(async () => {
        await this.#generateBestIntention();
      }, 200)
    })
  }

  async #generateBestIntention() {
    this.#intentionList.clean();

    // As long as a GoPutDownIntention is running, no other intentions can be generated
    if (this.#currentIntention && GoPutDownIntention.isTypeOf(this.#currentIntention)) {
      return;
    }

    // Store the intention of delivering the parcels we are carrying
    // to a red tile according to its weight
    if (this.#internalBelief.carriedParcelsCount >= 1) {
      if (this.#currentTargetTile) {
        // Check if the current target tile is a green one (we just picked up a parcel)
        const currentGreenTile = this.#internalBelief.tileMap.getGreenTile(this.#currentTargetTile);
        if (currentGreenTile) {
          // Select a random path from the current green to a red
          const red = this.#selectRandomWeightedPath();
          if (red) {
            this.#intentionList.goPutDown = new GoPutDownIntention(red.destinationCoordinates, red.path);
          }
        }
      }
    }

    // Store the intentions of picking up all the free parcels around us
    for (const parcel of this.#internalBelief.parcelList) {
      const intention = new GoPickUpIntention(parcel.parcel);
      this.#intentionList.goPickUp.push(intention);
    }

    // Store the intentions of going to green tiles, if the are no free parcels around us
    if (this.#internalBelief.parcelList.length == 0) {
      for (const green of this.#internalBelief.tileMap.greenTiles) {
        this.#intentionList.goTo.push(new GoToIntention(green.coordinates));
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

    // Best intention candidate: delivery parcels
    if (this.#intentionList.goPutDown) {
      bestIntention = this.#intentionList.goPutDown;
      return bestIntention;
    }

    // Best intention candidate: pick up the free parcel with the highest score
    let highestScore = 0;
    for (const intention of this.#intentionList.goPickUp) {
      const parcelScore = intention.parcel.reward;
      if (parcelScore > highestScore && parcelScore >= this.#internalBelief.parcelMinScore) {
        for (let i = 0; i < this.#internalBelief.nearAgentList.length; i++) {
          let currentCheckedAgent = this.#internalBelief.nearAgentList[i]
          const x = currentCheckedAgent.x;
          const y = currentCheckedAgent.y;

          if (x != undefined && y != undefined) {
            let agentDst = this.#distance({ x, y }, intention.parcel);
            let myDst = this.#distance(this.#me.coordinates, intention.parcel)
            let dst = myDst - agentDst

            if (dst < 0) {
              // If the difference on distances is positive, this means another agent is nearer to the packet
              highestScore = parcelScore;
              bestIntention = intention;
              this.randomMove = false
            }
          }
        }

        if (this.#internalBelief.nearAgentList.length == 0) {
          // List could be empty: the package is the best on that case
          highestScore = parcelScore;
          bestIntention = intention;
          this.randomMove = false;
        }
      }
    }

    // Best intention candidate: go to the nearest green tile, if we have not green tiles around us
    let minDistance = Number.MAX_VALUE;
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

    console.log("new intetion: ", intention)
    if (GoToIntention.isTypeOf(intention))
      console.log(this.#me.coordinates.toString(), " -> ", intention.destinationCoordinates.toString())

    this.#intentionPlanQueue.push({ intention: intention, plan: plan });

    await this.#achieveCurrentIntention();
  }

  async #achieveCurrentIntention() {
    // @ts-ignore
    const isCompleted = await this.#currentPlan.execute(this.#currentIntention);

    if (isCompleted) {
      if (this.#currentIntention) {
        this.#assignCurrentTargetTile(this.#currentIntention);
      }

      this.#intentionPlanQueue.pop()

      if (this.#currentIntention) {
        // TODO: Resume
      }
    }
  }

  async #stopCurrentIntention() {
    if (this.#currentPlan) {
      console.log("STOPPED ", this.#currentPlan)
      await this.#currentPlan.stop();
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
