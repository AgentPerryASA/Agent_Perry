/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */
/** @typedef Plan @type { import('./plan.js').Plan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import 'dotenv/config';
import { Coordinates } from "./coordinates.js";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client/DjsConnect.js";
import { GoPickUpIntention, GoPutDownIntention, GoToIntention, DeviateAndPickUpIntention } from "./intention.js";
import { Beliefs, TargetTile } from "./belief.js"
import { GoToPlan, GoPickUpPlan, GoPutDownPlan, DeviateAndPickUpPlan } from "./plan.js"

export class Agent {
  #socket;
  // TODO: TEO
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
    this.#planLibrary = [GoToPlan, GoPickUpPlan, GoPutDownPlan, DeviateAndPickUpPlan];
    this.#intentionList = new IntentionList();
    this.#intentionPlanQueue = [];
    this.#internalBelief = new Beliefs();
    this.#socket = DjsConnect();

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
    //Every possible parcel count for a possible deviation
    for (const parcel of this.#internalBelief.parcelList) {
      const deviateIntention = new DeviateAndPickUpIntention(parcel.parcel,this.#internalBelief.me.coordinates);
      this.#intentionList.deviateAndPickUp.push(deviateIntention);
    }

    //First, check whether deviation are possible. Rules:
    //check the current picked up parcel and their reward wrt the maximum value (mv) and test the one that has the smaller value.
    //assuming speed of movement being x, this means a move every x ms can be performed, therefore, a deviation is safe if the time to get the new parcel and return
    //to the original position allows the minimum parcel survive with reasonable time to achieve the action before the deviation. It is reasonable if the value of the new packet when I am in the previous position is higher than the carried parcel with minimum value.

    //Find if a goPutDown was already chosen. Use the cycle to also find out the packages that are already in list to be picked up, to prevent duplicates in deviations
    let goPutDownDecisionFound = false;
    let toPickUpList = new Map();
    let goPickUpDecisionFound = false; //needed later to prevent pushing two goPickUpIntention
    for(const i of this.#intentionPlanQueue) {
      if(GoPutDownIntention.isTypeOf(i.intention)) {
        goPutDownDecisionFound=true;
        continue
      } else if(DeviateAndPickUpIntention.isTypeOf(i.intention)) {
        toPickUpList.set(i.intention.parcel.id,i.intention.parcel);
        continue
      } else if(GoPickUpIntention.isTypeOf(i.intention)){
        toPickUpList.set(i.intention.parcel.id,i.intention.parcel);
        goPickUpDecisionFound=true;
      }
    }

    //Add to pickUpList already carried parcels
    for(const p of this.#internalBelief.carriedParcelList) {
      toPickUpList.set(p.parcel.id,p.parcel);
    }
    

    if(goPutDownDecisionFound && this.#internalBelief.deviateAndPickupIntentionCounter < 3){

      const minParcel = this.#internalBelief.getMinValuableParcel();
      const gameSpeed = this.#internalBelief.gameSpeed;
      const parcelDecayTime = this.#internalBelief.parcelDecayTimerValue*1000;

      for(let i=0; i<this.#intentionList.deviateAndPickUp.length; i+=1) {

        const dpi = this.#intentionList.deviateAndPickUp[i];
        const distance = this.#internalBelief.pathFinder ? this.#internalBelief.pathFinder.search(this.#internalBelief.me.coordinates,dpi.parcelCoordinates).length : this.#distance(this.#internalBelief.me.coordinates,dpi.parcelCoordinates)
        const lostReward = Math.floor((distance*gameSpeed*2)/parcelDecayTime);
        const futureValueNewParcel = dpi.parcel.reward-lostReward;
        const futureValueCarriedParcel = minParcel?minParcel.reward-lostReward:Number.MIN_VALUE;

        if(futureValueNewParcel>futureValueCarriedParcel && toPickUpList.get(dpi.parcel.id)==undefined) {

          this.#internalBelief.deviateAndPickupIntentionCounter+=1;
          return dpi;
        }

      } 
    }

    //If a GoPutDown was already decided, prevent generation of further decision. In this situation, the only one allowed is a deviation
    if (goPutDownDecisionFound || goPickUpDecisionFound) {
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
    if (this.#currentIntention && GoToIntention.isTypeOf(this.#currentIntention)) {
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
    this.#intentionPlanQueue.push({ intention: intention, plan: plan });

    console.log("new intention: ", intention, this.#intentionPlanQueue)

    if(DeviateAndPickUpIntention.isTypeOf(intention)) {
      console.log("--from ", intention.returnCoordinates, "to ", intention.parcelCoordinates, "for", intention.parcel.id)
    }
    if(GoPickUpIntention.isTypeOf(intention)) {
      console.log("--Go to parcel ", intention.parcel.id)
    }

    if (GoToIntention.isTypeOf(intention)) {
      console.log("--",this.#internalBelief.me.coordinates.toString(), " -> ", intention.destinationCoordinates.toString())
    }

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
      console.log("Popped ", tmp, this.#intentionPlanQueue)

      if (this.#currentIntention) {
        console.log("recover")
        // @ts-ignore
        await this.#achieveCurrentIntention()
      }
    }
  }

  async #stopCurrentIntention() {
    if (this.#currentPlan && this.#currentPlan.isRunning) {
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

class IntentionList {
  /** @type { GoToIntention[] } */
  #goTo;
  /** @type { GoPickUpIntention[] } */
  #goPickUp;
  /** @type { GoPutDownIntention | undefined } */
  goPutDown;

  /** @type { DeviateAndPickUpIntention[] } */
  #deviateAndPickUp

  constructor() {
    this.#goTo = [];
    this.#goPickUp = [];
    this.#deviateAndPickUp = [];
  }

  get goTo() {
    return this.#goTo;
  }

  get goPickUp() {
    return this.#goPickUp;
  }

  get deviateAndPickUp() {
    return this.#deviateAndPickUp;
  }

  clean() {
    this.#goTo = [];
    this.#goPickUp = [];
    this.goPutDown = undefined;
    this.#deviateAndPickUp = [];
  }
}
