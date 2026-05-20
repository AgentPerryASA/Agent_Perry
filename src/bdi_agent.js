/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */
/** @typedef Plan @type { import('./plan.js').Plan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import 'dotenv/config';
import { Coordinates } from "./coordinates.js";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client/DjsConnect.js";
import { GoPickUpIntention, GoPutDownIntention, GoToIntention, DeviateAndPickUpIntention } from "./intention.js";
import { Beliefs, TargetTile } from "./belief.js"
import { GoToPlan, GoPickUpPlan, GoPutDownPlan, DeviateAndPickUpPlan } from "./plan.js"

export class BDIAgent {
  #socket;
  // TODO: TEO -> belief
  #planLibrary;
  /** @type { {intention: Intention, plan: Plan}[] } */
  #intentionPlanQueue;
  // TODO: TEO -> belief
  /** @type { TargetTile | undefined } */
  #currentTargetTile;

  /** @type { Beliefs } */
  #internalBelief;

  /**
   * @param {string} token 
   */
  constructor(token) {
    this.#planLibrary = [GoToPlan, GoPickUpPlan, GoPutDownPlan, DeviateAndPickUpPlan];
    this.#intentionPlanQueue = [];
    this.#internalBelief = new Beliefs();
    this.#socket = DjsConnect(undefined, token);

    this.init();
  }

  get socket() {
    return this.#socket;
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
      this.#socket.onYou((agent) => {
        this.#internalBelief.updateMe(agent);

        resolve(true);
      });
    }));

    // Wait onConfig, onMap and onYou to receive the first event before starting the logic
    // The average parcel score, the tile map and the "me" info are required for the following classes and methods
    Promise.all(promiseList).then(async () => {

      // Keep track of parcels around us
      this.#socket.onSensing(async sensing => {
        this.#internalBelief.reviseParcelList(sensing.parcels)
        this.#internalBelief.reviseCarriedParcelList(sensing.parcels);
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
    const goPutDownIntention = this.#getFirstInstanceOfTypeInQueue(GoPutDownIntention);
    // Check if any deviation is possible only if our main intention is to delivery
    if (goPutDownIntention && this.#internalBelief.deviateAndPickupIntentionCounter < 5) {
      const gameSpeed = this.#internalBelief.gameSpeed;
      const parcelDecayTime = this.#internalBelief.parcelDecayTimerValue * 1000;

      for (const parcel of this.#internalBelief.parcelList) {
        const parcelCoordinates = new Coordinates(parcel.parcel.x, parcel.parcel.y);

        // Compute the distance from the parcel
        const distance = this.#internalBelief.pathFinder ?
          this.#internalBelief.pathFinder.search(this.#internalBelief.me.coordinates, parcelCoordinates).length :
          this.#distance(this.#internalBelief.me.coordinates, parcelCoordinates);
        // Estimate the loss of the reward of parcels if we deviated
        // NOTE: sometimes the deviation might be along the main path, other times we have to go back,
        //       so the 1.5 multiplier estimate the distance covered per each deviation
        const lostReward = Math.floor((distance * gameSpeed * 1.5) / parcelDecayTime);
        // Estimate the reward of the new parcel after the deviation
        const futureValueNewParcel = parcel.parcel.reward - lostReward;

        if (futureValueNewParcel > this.#internalBelief.parcelMinScore) {
          this.#internalBelief.deviateAndPickupIntentionCounter += 1;
          // @ts-ignore
          // NOTE: if entered here, goPutDownIntention is safely of type GoPutDownIntention
          return new DeviateAndPickUpIntention(parcel.parcel, goPutDownIntention.deliveryCoordinates);
        }
      }
    }

    // If either a GoPutDownIntention or a GoPickUpIntention was already decided,
    // prevent generation of further intentions. In this situation, the only one allowed is a deviation
    const goPickUpIntentionFound = this.#isTypeOfIntentionInQueue(GoPickUpIntention);
    if (goPutDownIntention || goPickUpIntentionFound) {
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
    const goToIntentionFound = this.#isTypeOfIntentionInQueue(GoToIntention);
    if (goToIntentionFound) {
      return;
    }

    // Check the intention of going to a green tile, if there are no free parcels around us or in our memory
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
    // If a GoToIntention was stopped, pop it (no need to be maintained in the queue)
    if (this.#currentIntention && GoToIntention.isTypeOf(this.#currentIntention)) {
      this.#intentionPlanQueue.pop();
    }

    this.#intentionPlanQueue.push({ intention: intention, plan: plan });

    await this.#achieveCurrentIntention();
  }

  async #achieveCurrentIntention() {
    // @ts-ignore
    // NOTE: at this point, both currentIntention and currentPlan cannot be undefined
    const isCompleted = await this.#currentPlan.execute(this.#currentIntention);

    // Pop current intention-plan pair if the intention is achieved or, if it was stopped,
    // it was a GoToIntention (no need to be maintained in the queue)
    if (isCompleted) {
      if (this.#currentIntention) {
        // Assign the target tile we just reached, if exists
        this.#assignCurrentTargetTile(this.#currentIntention);
      }

      const oldPlan = this.#currentPlan;
      this.#intentionPlanQueue.pop()

      if (this.#currentIntention) {
        if (oldPlan && DeviateAndPickUpPlan.isTypeOf(oldPlan)) {
          if (this.#currentPlan && GoPutDownPlan.isTypeOf(this.#currentPlan)) {
            // Re-execute GoPutDownPlan using the path pre-calculated by DeviateAndPickUpPlan
            this.#currentPlan.pathFromDeviation = oldPlan.pathFromParcelToTarget;
          }
        }

        await this.#achieveCurrentIntention()
      }
    }
  }

  async #stopCurrentIntention() {
    if (this.#currentPlan && this.#currentPlan.isRunning) {
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

  /**
   * @param {typeof GoToIntention | typeof GoPickUpIntention | typeof GoPutDownIntention | typeof DeviateAndPickUpIntention} intentionClass 
   */
  #isTypeOfIntentionInQueue(intentionClass) {
    return this.#intentionPlanQueue.some(obj => obj.intention instanceof intentionClass);
  }

  /**
   * @param {typeof GoToIntention | typeof GoPickUpIntention | typeof GoPutDownIntention | typeof DeviateAndPickUpIntention} intentionClass
  */
  #getFirstInstanceOfTypeInQueue(intentionClass) {
    return this.#intentionPlanQueue.find(obj => obj.intention instanceof intentionClass)?.intention;
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
