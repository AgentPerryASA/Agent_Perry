/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */
/** @typedef Plan @type { import('./plan.js').Plan } */
/** @typedef Intention @type { import("./intention.js").Intention } */
/** @typedef Message @type { import("./utils/message.js").Message } */

import 'dotenv/config';
import { Coordinates } from "./utils/coordinates.js";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client/DjsConnect.js";
import { GoPickUpIntention, GoPutDownIntention, GoToIntention, DeviateAndPickUpIntention } from "./intention.js";
import { Beliefs } from "./belief.js";
import { GoPutDownPlan, DeviateAndPickUpPlan } from "./plan.js";
import { LLMParametersTuningRequestMessage, HandshakeMessage, LLMIntentionMessage, LLMIntentionTakenChargeMessage, LLMSetIdMessage, LLMParametersTuningResponseMessage, LLMMapRequestMessage, LLMMapResponseMessage, LLMSetTileWeightMultiplierMessage } from './utils/message.js';
import { LLMUpdatedParameters } from './utils/beliefs_utils.js';
import { TargetTile } from './utils/path_utils.js';
import { LLMGoPutDownIntention, LLMGoToIntention, LLMGreenRedLightIntention, LLMIntention } from "./llm_intention.js";
import { calc } from './utils/llm_tools.js';

export class BDIAgent {
  #socket;
  /** @type { LLMIntention | undefined } */
  #llmIntention;
  /** @type { {intention: Intention | LLMIntention, plan: Plan}[] } */
  #intentionPlanQueue;
  /** @type { Beliefs } */
  #internalBelief;
  /**@type {boolean}*/
  #wasRequestForTuningSent;

  /**
   * @param {string} token 
   */
  constructor(token) {
    this.#intentionPlanQueue = [];
    this.#internalBelief = new Beliefs();
    this.#socket = DjsConnect(undefined, token);
    this.#wasRequestForTuningSent = false;

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
        this.#internalBelief.updateGameConfiguration(config);

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

    this.#socket.onMsg((id, name, msg, reply) => this.#onMsg(id, name, msg, reply));
    // Ask the handshake to the team mate
    this.#handshake();

    // Wait onConfig, onMap and onYou to receive the first event before starting the logic
    // The average parcel score, the tile map and the "me" info are required for the following classes and methods
    Promise.all(promiseList).then(async () => {
      // Keep track of parcels around us
      this.#socket.onSensing(async sensing => {
        this.#internalBelief.reviseParcelList(sensing.parcels);
        this.#internalBelief.me.reviseCarriedParcelList(sensing.parcels);
        this.#internalBelief.updateNearAgentList(sensing.agents);
        this.#internalBelief.updateTileWithCrate(sensing.crates);
      });

      // Constantly generate the best intention based on our sensing
      setInterval(async () => {
        await this.#generateBestIntention();
      }, 100);

      //Ask the LLM for parameters fine tuning every 1-2 minutes
      setInterval(async () => {
        if (this.#wasRequestForTuningSent) {
          return;
        }

        this.#wasRequestForTuningSent = true;

        //await this.#requestParametersTuningToLLM();

      }, 20 * 1000);
    });
  }

  #handshake() {
    const handshakeKey = process.env.HANDSHAKE_KEY;
    if (!handshakeKey) {
      console.error("Error: missing HANDSHAKE_KEY in .env file");
      process.exit(1);
    }

    this.#socket.emitShout(new HandshakeMessage({ key: handshakeKey }));
  }

  async #requestParametersTuningToLLM() {
    const msg = new LLMParametersTuningRequestMessage({ currentParameters: this.#internalBelief.getBeliefsForLLM() });

    this.#socket.emitSay(this.#internalBelief.me.llmId, msg);
  }

  /**
   * @param {string} id 
   * @param {string} name 
   * @param {{}} message
   * @param {Function} reply
   */
  #onMsg(id, name, message, reply) {
    let msg;

    if (typeof message === "string" || !("type" in message)) {
      //Reject message if it was written in chat (string) or if is missing the type
      return;
    }

    switch (message.type) {
      case HandshakeMessage.TYPE:
        {
          if (!("key" in message)) {
            return;
          }

          msg = new HandshakeMessage({ key: /**@type {string}*/(message.key) });
          if (msg.key == process.env.HANDSHAKE_KEY) {
            this.#internalBelief.me.mateId = id;
          }
        }
        break;
      case LLMGoToIntention.TYPE:
        {
          if (!("destinationCoordinates" in message) || !("sender" in message) || !("value" in message)) {
            return;
          }

          //Check who was the sender: if the sender was the agent which is not the one connected to the llm, this means that the message was rejected by both agent, therefore it must be discarded
          const sender = message.sender;
          if (sender == this.#internalBelief.me.mateId && this.#internalBelief.me.llmId == this.#internalBelief.me.id) {
            return;
          }

          this.#llmIntention = new LLMGoToIntention(
            /**@type {Coordinates}*/(message.destinationCoordinates),
            /**@type {string}*/(message.value),
            /**@type {string}*/(message.sender)
          );
        }
        break;
      case LLMGoPutDownIntention.TYPE:
        {
          if (!("deliveryCoordinates" in message) || !("sender" in message) || !("value" in message)) {
            return;
          }

          //Check who was the sender: if the sender was the agent which is not the one connected to the llm, this means that the message was rejected by both agent, therefore it must be discarded
          const sender = message.sender;
          if (sender == this.#internalBelief.me.mateId && this.#internalBelief.me.llmId == this.#internalBelief.me.id) {
            return;
          }

          this.#llmIntention = new LLMGoPutDownIntention(
            /**@type {Coordinates}*/(message.deliveryCoordinates),
            /**@type {string}*/(message.value),
            /**@type {string}*/(message.sender)
          );

          this.#reviseLLMGoPutDownIntention();
        }
        break;
      case LLMGreenRedLightIntention.TYPE:
        {
          if (!("destinationCoordinates" in message) || !("destination" in message) || !("sender" in message)) {
            return;
          }

          //Check who was the sender: if the sender was the agent which is not the one connected to the llm, this means that the message was rejected by both agent, therefore it must be discarded
          const sender = message.sender;
          if (sender == this.#internalBelief.me.mateId && this.#internalBelief.me.llmId == this.#internalBelief.me.id) {
            return;
          }

          this.#llmIntention = new LLMGreenRedLightIntention(
            /**@type {{parity:String, type:string}}*/(message.destination),
            /**@type {string}*/(message.sender),
            /**@type {Coordinates}*/(message.destinationCoordinates)
          );
        }
        break;
      case LLMSetTileWeightMultiplierMessage.TYPE:
        {
          if (!("coordinates" in message) || !("multiplierString" in message)) {
            return;
          }

          const intention = new LLMSetTileWeightMultiplierMessage(
            {
              coordinates: /**@type {Coordinates[]}*/(message.coordinates),
              multiplierString: /**@type {string[]}*/(message.multiplierString)
            }
          );

          for (let i = 0; i < intention.coordinates.length; i += 1) {
            //Copy needed for correcting obtain the string equivalent to use as a key and value
            const coordCopy = new Coordinates(intention.coordinates[i].x, intention.coordinates[i].y);
            const multCopy = intention.multiplierString[i];

            this.#internalBelief.enhancedDeliveryTilesMap.set(coordCopy.toString(), multCopy);
          }
        }
        break;
      case LLMSetIdMessage.TYPE:
        {
          if (!("llmAgentId" in message)) {
            return;
          }

          const messageId = /**@type {string}*/(message.llmAgentId);
          this.#internalBelief.me.llmId = messageId;
        }
        break;
      case LLMParametersTuningResponseMessage.TYPE:
        {
          if (!("updatedParameters" in message)) {
            return;
          }

          const updatedParameters = /**@type {LLMUpdatedParameters}*/(message.updatedParameters);

          this.internalBelief.updateParameters(updatedParameters);

          this.#wasRequestForTuningSent = false;
        }
        break;
      case LLMMapRequestMessage.TYPE:
        {
          const response = new LLMMapResponseMessage(this.#internalBelief.tileMap.tiles);
          reply(response);
        }
        break;
      default:
        {
          msg = String(message);
        }
        break;
    }
  }

  /**
   * @param {Message | LLMIntention} message 
   */
  #sendToMate(message) {
    this.#socket.emitSay(
      this.#internalBelief.me.mateId,
      message
    );
  }

  async #generateBestIntention() {
    //LLM intention always have priority
    /**
     * @type {LLMIntention | Intention | undefined}
     */
    let bestIntention = this.#selectBestIntention();

    if (bestIntention) {
      await this.#pushIntention(bestIntention);
    }
  }

  #selectBestIntention() {

    const MAX_DISTANCE_LLM_GO_TO_DEVIATION = 3;

    //First check if a LLMGoToIntention is convenient or not. If necessary, send it to the other agent. This intention is convenient if the distance from the current position is < MAX_DISTANCE_LLM_GO_TO_DEVIATION or if the reward is higher than the current value of carried parcels
    if (this.#llmIntention && LLMGoToIntention.isTypeOf(this.#llmIntention)) {
      const distance = this.#internalBelief.pathFinder?.search(this.#internalBelief.me.coordinates, this.#llmIntention.destinationCoordinates);

      let valueOfCarriedParcels = 0;

      for (const [_, parcel] of this.#internalBelief.carriedParcelsMap) {
        if (parcel) {
          valueOfCarriedParcels += parcel.reward;
        }
      }

      if (distance && (distance.length < MAX_DISTANCE_LLM_GO_TO_DEVIATION || valueOfCarriedParcels < Number(this.#llmIntention.value))) {
        return this.#llmIntention;
      } else if (this.#llmIntention) {
        //Send to mate and clear the LLMintention
        this.#llmIntention.sender = this.#internalBelief.me.id;
        this.#sendToMate(this.#llmIntention);
        this.#llmIntention = undefined;
      }

    }

    const numberOfPossibleDeviations = this.internalBelief.numberOfPossibleDeviations;
    const goPutDownIntention = this.#getFirstInstanceOfTypeInQueue(GoPutDownIntention);
    // Check if any deviation is possible only if our main intention is to delivery
    if (goPutDownIntention && this.#internalBelief.deviateAndPickupIntentionCounter < numberOfPossibleDeviations) {
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

          // NOTE: if entered here, goPutDownIntention is safely of type GoPutDownIntention
          const int = new DeviateAndPickUpIntention(parcel.parcel, /**@type {GoPutDownIntention} */(goPutDownIntention).deliveryCoordinates);

          return int;
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
      if (this.#internalBelief.currentTargetTile) {
        // Check if the current target tile is a green one (we just picked up a parcel)
        const currentGreenTile = this.#internalBelief.tileMap.getGreenTile(this.#internalBelief.currentTargetTile);
        if (currentGreenTile) {
          // Select a random path from the current green to a red
          const red = this.#selectRandomWeightedPath();
          if (red) {
            // Return best intention

            const int = new GoPutDownIntention(red.destinationCoordinates, red.path);

            return int;
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
    if (this.#internalBelief.currentTargetTile) {
      // Check if the current target tile is a red one (we just put down a parcel)
      const currentRedTile = this.#internalBelief.tileMap.getRedTile(this.#internalBelief.currentTargetTile);
      if (currentRedTile) {
        // Select a random path from the current red to a green
        const green = this.#selectRandomWeightedPath();
        if (green) {
          const int = new GoToIntention(green.destinationCoordinates, green.path);

          return int;
        }
      }
    }
    // ... otherwise select a random green tile
    const greenTilesCount = this.#internalBelief.tileMap.greenTiles.length;
    const randomTileIndex = Math.floor(Math.random() * greenTilesCount);
    const green = this.#internalBelief.tileMap.greenTiles[randomTileIndex];
    return new GoToIntention(green.coordinates);
  }

  async #reviseLLMGoPutDownIntention() {
    //If a GoPutDownIntention was present in the queue and the new intention is a LLMGoPutDown replace the previous one instead of pushing a new one. In this particular situation, a push is not needed

    const goPutDownIntentionInQueueIndex = this.#getIndexOfFirstInstanceOfTypeInQueue(GoPutDownIntention);

    if (goPutDownIntentionInQueueIndex != undefined && this.#llmIntention && LLMGoPutDownIntention.isTypeOf(this.#llmIntention)) {

      const goPutDownIntentionReference = /**@type {GoPutDownIntention}*/(this.#intentionPlanQueue[goPutDownIntentionInQueueIndex].intention);
      let valueOfCarriedParcels = 0;

      for (const [_, parcel] of this.#internalBelief.carriedParcelsMap) {
        if (parcel) {
          valueOfCarriedParcels += parcel.reward;
        }
      }

      if (valueOfCarriedParcels < calc(valueOfCarriedParcels + this.#llmIntention.value)) {
        //Create replacement plan and intention, but only if perry will gain more point that the one it will get by delivering parcels normally

        goPutDownIntentionReference.deliveryCoordinates = this.#llmIntention.deliveryCoordinates;

        //Check if the plan was executing, if so stop it, pop the plan and push the intention like it was a new one
        if (this.#currentPlan && GoPutDownPlan.isTypeOf(this.#currentPlan) && this.#currentPlan.isRunning) {

          await this.#stopCurrentIntention();
          this.#intentionPlanQueue.pop();
          this.#pushIntention(new GoPutDownIntention(this.#llmIntention.deliveryCoordinates, undefined));
        }

        this.#llmIntention = undefined;

      } else {
        //If not convenient, send to the other agent

        this.#llmIntention.sender = this.#internalBelief.me.id;
        this.#sendToMate(this.#llmIntention);
        this.#llmIntention = undefined;
      }

    } else if (this.#internalBelief.carriedParcelsCount == 0 && this.#llmIntention && LLMGoPutDownIntention.isTypeOf(this.#llmIntention)) {
      //If no put down are currently be performed, send to the other agent
      this.#llmIntention.sender = this.#internalBelief.me.id;
      this.#sendToMate(this.#llmIntention);
      this.#llmIntention = undefined;
    }
  }

  /**
   * @param {Intention | LLMIntention} intention 
   */
  async #pushIntention(intention) {
    // Skip push if the intention is already in the queue or in the queue there is a LLM intention (LLM intention have priority)
    for (const intentionPlan of this.#intentionPlanQueue) {
      const extractedIntention = intentionPlan.intention;
      if (extractedIntention.isEqual(intention) || LLMIntention.isTypeOf(extractedIntention)) {
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

    if (LLMIntention.isTypeOf(intention)) {
      //Now that the intention is about to be executed, free the received llmintention
      this.#llmIntention = undefined;
    }

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
      this.#intentionPlanQueue.pop();

      if (this.#currentIntention) {
        if (oldPlan && DeviateAndPickUpPlan.isTypeOf(oldPlan)) {
          if (this.#currentPlan && GoPutDownPlan.isTypeOf(this.#currentPlan)) {
            // Re-execute GoPutDownPlan using the path pre-calculated by DeviateAndPickUpPlan
            this.#currentPlan.pathFromDeviation = oldPlan.pathFromParcelToTarget;
          }
        }

        await this.#achieveCurrentIntention();
      }
    }
  }

  async #stopCurrentIntention() {
    if (this.#currentPlan && this.#currentPlan.isRunning) {
      await this.#currentPlan.stop();
    }
  }

  /**
   * @param {LLMIntention | Intention} intention 
   */
  #assignCurrentTargetTile(intention) {
    if (GoPickUpIntention.isTypeOf(intention)) {
      const greenTile = this.#internalBelief.tileMap.getGreenTile(new TargetTile(intention.parcelCoordinates));
      if (greenTile) {
        this.#internalBelief.currentTargetTile = greenTile;
      }
    }

    if (GoPutDownIntention.isTypeOf(intention)) {
      const redTile = this.#internalBelief.tileMap.getRedTile(new TargetTile(intention.deliveryCoordinates));
      if (redTile) {
        this.#internalBelief.currentTargetTile = redTile;
      }
    }
  }

  #selectRandomWeightedPath() {
    if (!this.#internalBelief.currentTargetTile) {
      return;
    }

    const totalWeight = [...this.#internalBelief.currentTargetTile.pathList.values()]
      .reduce((sum, weightedPath) => sum + weightedPath.weight, 0);

    let random = Math.random() * totalWeight;

    for (const [destinationCoordinates, weightedPath] of this.#internalBelief.currentTargetTile.pathList) {
      //If a delivery cell makes the agent gain more points (or less), this is applied to the weight
      const multiplier = this.#internalBelief.enhancedDeliveryTilesMap.get(destinationCoordinates.toString());
      if (multiplier) {
        const finalWeight = calc(weightedPath.weight.toString() + multiplier);

        random -= finalWeight;
      } else {
        random -= weightedPath.weight;
      }

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

  /**
   * @param {typeof GoToIntention | typeof GoPickUpIntention | typeof GoPutDownIntention | typeof DeviateAndPickUpIntention} intentionClass
  */
  #getIndexOfFirstInstanceOfTypeInQueue(intentionClass) {
    for (let i = 0; i < this.#intentionPlanQueue.length; i += 1) {
      if (intentionClass.isTypeOf(this.#intentionPlanQueue[i].intention)) {
        return i;
      }
    }
    return undefined;
  }

  /** @type { function ({x:number, y:number}, {x:number, y:number}): number } */
  #distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    const dx = Math.abs(Math.round(x1) - Math.round(x2));
    const dy = Math.abs(Math.round(y1) - Math.round(y2));
    return dx + dy;
  }

  /**
   * @param {LLMIntention | Intention} intention 
   */
  selectPlan(intention) {
    for (const plan of this.#internalBelief.planLibrary) {
      if (plan.isApplicable(intention)) {
        return new plan(this);
      }
    }
  }
}
