/** @typedef IOParcel @type { import("@unitn-asa/deliveroo-js-sdk/server").IOParcel } */
/** @typedef Plan @type { import('./plan.js').Plan } */
/** @typedef Intention @type { import("./intention.js").Intention } */
/** @typedef Message @type { import("./message.js").Message } */
/** @typedef LLMIntention @type {import("./llm_intention.js").LLMIntention} */


import 'dotenv/config';
import { Coordinates } from "./coordinates.js";
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client/DjsConnect.js";
import { GoPickUpIntention, GoPutDownIntention, GoToIntention, DeviateAndPickUpIntention } from "./intention.js";
import { Beliefs, TargetTile } from "./belief.js";
import { GoPutDownPlan, DeviateAndPickUpPlan } from "./plan.js";
import { HandshakeMessage, LLMIntentionMessage, LLMIntentionTakenChargeMessage } from './message.js';
import { LLMGoToIntention } from './llm_intention.js';

export class BDIAgent {
  #socket;
  /** @type { LLMIntention | undefined } */
  #llmIntention;
  /** @type { {intention: Intention, plan: Plan}[] } */
  #intentionPlanQueue;
  /** @type { Beliefs } */
  #internalBelief;

  /**
   * @param {string} token 
   */
  constructor(token) {
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

    this.#socket.onMsg((id, name, msg) => this.#onMsg(id, name, msg));
    // Ask the handshake to the team mate
    this.#handshake();

    // Wait onConfig, onMap and onYou to receive the first event before starting the logic
    // The average parcel score, the tile map and the "me" info are required for the following classes and methods
    Promise.all(promiseList).then(async () => {
      // Keep track of parcels around us
      this.#socket.onSensing(async sensing => {
        this.#internalBelief.reviseParcelList(sensing.parcels);
        this.#internalBelief.reviseCarriedParcelList(sensing.parcels);
        this.#internalBelief.updateNearAgentList(sensing.agents);
        this.#internalBelief.updateTileWithCrate(sensing.crates);
      });

      // Constantly generate the best intention based on our sensing
      setInterval(async () => {
        await this.#generateBestIntention();
      }, 100);
    });
  }

  async #handshake() {
    const handshakeKey = process.env.HANDSHAKE_KEY;
    if (!handshakeKey) {
      console.error("Error: missing HANDSHAKE_KEY in .env file");
      process.exit(1);
    }

    this.#socket.emitShout(new HandshakeMessage({ key: handshakeKey }));
  }

  /**
   * @param {string} id 
   * @param {string} name 
   * @param {{}} message
   */
  async #onMsg(id, name, message) {
    let msg;

    // @ts-ignore
    switch (message.type) {
      case HandshakeMessage.TYPE:
        // @ts-ignore
        msg = new HandshakeMessage(message)
        if (msg.key == process.env.HANDSHAKE_KEY) {
          this.#internalBelief.mateId = id;
          // console.log(`${this.#internalBelief.me.name} (${this.#internalBelief.me.id}) received handshake from ${name}`)
        }
        break;
      case LLMIntentionMessage.TYPE:
        // TODO: No way to know if it is sent by LLM or other agent, #llmIntention is null

        if (message.intention.type == LLMGoToIntention.TYPE) {
          this.#llmIntention = new LLMGoToIntention(message.intention.destinationCoordinates);
          msg = new LLMIntentionMessage({ intention: this.#llmIntention });
        }

        // @ts-ignore
        // msg = new LLMIntentionMessage(message);
        console.log(`${this.#internalBelief.me.name} received (${msg.intention}}) from LLM`)

        // this.#llmIntention = msg.intention;

        // this.#sendToMate(`Do (${msg.action}, ${msg.actionInput})`);
        // const response = new BDIRespondeMessage({ content: "No thanks" });
        // this.#sendToLLM(response);
        break;
      case LLMIntentionTakenChargeMessage.TYPE:
        console.log(`${this.#internalBelief.me.name} OK`)
        // The other agent has taken charge the LLM intention
        // @ts-ignore
        msg = new LLMIntentionTakenChargeMessage(message);
        // TODO: ok, I know what the other agent is doing
        break
      default:
        msg = String(message);
        if (msg) {
          console.log(`${this.#internalBelief.me.name} received ${msg} from ${name}`)
        }
    }

    // console.log(`${this.#internalBelief.me.name} (${this.#internalBelief.me.id}) received "${msg.content}" from ${name}`)
  }

  /**
   * @param {Message} message 
   */
  #sendToLLM(message) {
    this.#socket.emitSay(
      // NOTE: The BDI agent is not programmed to receive messages from itself,
      // so this will be received only by the LLM if associated to this agent
      this.#internalBelief.me.id,
      message
    )
  }

  /**
   * @param {Message} message 
   */
  #sendToMate(message) {
    this.#socket.emitSay(
      this.#internalBelief.mateId,
      message
    )
  }

  #teo = false;
  async #generateBestIntention() {
    let bestIntention = this.#selectBestIntention();

    if (this.#llmIntention && !this.#teo) {
      const llmIntentionConverted = this.#convertLLMIntention();
      console.log(llmIntentionConverted)

      if (llmIntentionConverted) {
        // In case this agent decided to take charge the LLM intention ...
        bestIntention = llmIntentionConverted;

        console.log(`${this.#internalBelief.me.name} has taken charge LLM intention`)

        const message = new LLMIntentionTakenChargeMessage({ intention: this.#llmIntention });
        this.#sendToMate(message);

        this.#teo = true;
      } else {
        // ... otherwise, forward the LLM intention to the mate
        const message = new LLMIntentionMessage({ intention: this.#llmIntention });

        this.#sendToMate(message);

        this.#llmIntention = undefined;
      }

      // TODO: respond to LLM about any decision?
    }

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

  #convertLLMIntention() {
    if (this.#llmIntention && this.#llmIntention.type == LLMGoToIntention.TYPE) {
      // TODO: revision

      return new GoToIntention(this.#llmIntention.destinationCoordinates);
    }
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
      // console.log("pop ", this.#currentIntention);
      this.#intentionPlanQueue.pop();
    }

    // console.log("push ", intention, this.#intentionPlanQueue);
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
   * @param {Intention} intention 
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
    const dx = Math.abs(Math.round(x1) - Math.round(x2));
    const dy = Math.abs(Math.round(y1) - Math.round(y2));
    return dx + dy;
  }

  /**
   * @param {Intention} intention 
   */
  selectPlan(intention) {
    for (const plan of this.#internalBelief.planLibrary) {
      if (plan.isApplicable(intention)) {
        return new plan(this);
      }
    }
  }
}
