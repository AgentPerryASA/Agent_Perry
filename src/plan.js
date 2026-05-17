/** @typedef Plan @type { GoToPlan | GoPickUpPlan  | GoPutDownPlan | DeviateAndPickUpPlan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import { Agent } from "./agent.js";
import {
  GoPickUpIntention,
  GoToIntention,
  GoPutDownIntention,
  DeviateAndPickUpIntention,
} from "./intention.js";
import { PathFinder, MapPoint } from "./path_finder.js";

class PlanBase {
  #agent;
  /** @type { Plan | undefined } */
  #subPlan;
  #isRunning;
  isStopped;
  /** @type { Function | undefined } */
  #stopResolver;

  /**
   * @param {Agent} agent
   */
  constructor(agent) {
    this.#agent = agent;
    this.#isRunning = false;
    this.isStopped = false;
  }

  get agent() {
    return this.#agent;
  }

  /**
   * @param { boolean } value
   */
  set isRunning(value) {
    this.#isRunning = value;
    if (this.#stopResolver) {
      this.#stopResolver();
      this.#stopResolver = undefined;
    }
  }

  get isRunning() {
    return this.#isRunning;
  }

  /**
   * @param {Intention} intention
   */
  async achieveSubIntention(intention) {
    // if (!this.#subPlan) {
    //   // Do not regenerate the plan if this already exists: means a recovery in in action
    //   this.#subPlan = this.agent.selectPlan(intention);
    // }

    this.#subPlan = this.agent.selectPlan(intention);

    if (this.#subPlan) {
      // @ts-ignore
      const isCompleted = await this.#subPlan.execute(intention);
      if (isCompleted) {
        this.#subPlan = undefined;
        return true;
      }
    }

    return false;
  }

  async stop() {
    if (this.#isRunning) {
      this.isStopped = true;

      if (this.#subPlan) {
        // Stop the sub-plan, if exists, and if this is the case, execute() sets isRunning
        // to false and returns false
        await this.#subPlan.stop();
      } else {
        // If only the main plan is running, wait until execute() sets isRunning
        // to false and returns false
        await new Promise((resolve) => {
          this.#stopResolver = resolve;
        });
      }
    }
  }
}

export class GoToPlan extends PlanBase {
  #pathFinder;
  #MAX_MOVE_ATTEMPTS = 10
  #moveAttemptCount;

  /**
   * @param {Agent} agent
   */
  constructor(agent) {
    super(agent);

    this.#pathFinder = new PathFinder(this.agent.internalBelief.tileMap.tiles);
    this.#moveAttemptCount = 0;
  }

  /**
   * @param {Intention} intention
   */
  static isApplicable(intention) {
    return GoToIntention.isTypeOf(intention);
  }

  /**
   * @param {GoToIntention} intention
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const end = intention.destinationCoordinates;
    let blockPoint;
    let path = intention.path ?
      intention.path :  // Use the path pre-computed by the intention, if available ...
      this.#pathFinder.search(this.agent.internalBelief.me.coordinates, end)  // ... otherwise search a path

    do {
      if (blockPoint) {
        // Temporarily replace the position of the obstacle with a '0' tile
        path = this.#pathFinder.search(this.agent.internalBelief.me.coordinates, end, blockPoint);
      }

      blockPoint = await this.#executePath(path)

      if (this.isStopped) {
        this.isRunning = false;
        return false;
      }

      // Repeat the loop if the plan is still running but the path is not completed (due to a block on the path)
    } while (blockPoint && this.isRunning);

    this.isRunning = false;
    return true;
  }

  /**
   * @param {MapPoint[]} path
  */
  async #executePath(path) {
    const a = this.agent.internalBelief.me;
    let i = 1;

    while (i < path.length) {
      if (this.isStopped) {
        this.isRunning = false;
        return;
      }

      const step = path[i];

      this.#moveAttemptCount++;

      let movedHorizontally;
      let movedVertically;

      if (a.coordinates.x < step.x) {
        movedHorizontally = await this.agent.socket.emitMove("right");
      } else if (a.coordinates.x > step.x) {
        movedHorizontally = await this.agent.socket.emitMove("left");
      }

      if (movedHorizontally) {
        a.coordinates.x = movedHorizontally.x;
      }

      if (this.isStopped) {
        this.isRunning = false;
        return;
      }

      if (a.coordinates.y < step.y) {
        movedVertically = await this.agent.socket.emitMove("up");
      } else if (a.coordinates.y > step.y) {
        movedVertically = await this.agent.socket.emitMove("down");
      }

      if (movedVertically) {
        a.coordinates.y = movedVertically.y;
      }

      if (!movedHorizontally && !movedVertically) {
        // Agent did not move
        console.log("FAIL", movedHorizontally, movedVertically)

        if (this.#moveAttemptCount > this.#MAX_MOVE_ATTEMPTS) {
          // Stop the execution of the path if after 10 consecutive attempts to move the agent is blocked
          return step;
        }

        // Wait for next attempt of move, otherwise the server disconnect you
        await new Promise(res => setTimeout(res, 50));
      } else {
        // Agent moved
        this.#moveAttemptCount = 0;
        i++;
      }
    }

    return;
  }

  /**
   * @param {Plan} plan 
   */
  static isTypeOf(plan) {
    return plan instanceof this;
  }
}

export class GoPickUpPlan extends PlanBase {
  /**
   * @param {Intention} intention
   */
  static isApplicable(intention) {
    return GoPickUpIntention.isTypeOf(intention);
  }

  /**
   * @param {GoPickUpIntention} intention
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const subIntention = new GoToIntention(intention.parcelCoordinates);

    const isCompleted = await this.achieveSubIntention(subIntention);

    if (!isCompleted) {
      // The sub-intention was stopped
      this.isStopped = true;
      this.isRunning = false;
      return false;
    }

    const result = await this.agent.socket.emitPickup();

    if (result.length > 0) {
      this.agent.internalBelief.carriedParcelsCount += 1;
    }

    this.isRunning = false;
    return true;
  }

  /**
   * @param {Plan} plan 
   */
  static isTypeOf(plan) {
    return plan instanceof this;
  }
}

export class GoPutDownPlan extends PlanBase {
  /** @type { MapPoint[] | undefined } */
  #pathFromDeviation;

  /**
   * @param {MapPoint[] | undefined} value 
   */
  set pathFromDeviation(value) {
    this.#pathFromDeviation = value;
  }

  /**
   * @param {Intention} intention
   */
  static isApplicable(intention) {
    return GoPutDownIntention.isTypeOf(intention);
  }

  /**
   * @param {GoPutDownIntention} intention
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const path = this.#pathFromDeviation ? this.#pathFromDeviation : intention.path;
    const subIntention = new GoToIntention(intention.deliveryCoordinates, path);

    const isCompleted = await this.achieveSubIntention(subIntention);

    if (!isCompleted) {
      // The sub-intention was stopped
      this.isStopped = true;
      this.isRunning = false;
      return false;
    }

    const putDownResult = await this.agent.socket.emitPutdown();

    if (putDownResult.length > 0) {
      this.agent.internalBelief.carriedParcelsCount = 0;
    }

    this.agent.internalBelief.deviateAndPickupIntentionCounter = 0;
    this.isRunning = false;
    return true;
  }

  /**
   * @param {Plan} plan 
   */
  static isTypeOf(plan) {
    return plan instanceof this;
  }
}

export class DeviateAndPickUpPlan extends PlanBase {
  #pathFinder;
  /** @type { MapPoint[] | undefined } */
  #pathFromParcelToTarget;

  /**
   * @param {Agent} agent 
   */
  constructor(agent) {
    super(agent)
    // TODO: expose pathfinder from beliefs (goto too)
    this.#pathFinder = new PathFinder(this.agent.internalBelief.tileMap.tiles);
  }

  get pathFromParcelToTarget() {
    return this.#pathFromParcelToTarget;
  }

  /**
   * @param {Intention} intention
   */
  static isApplicable(intention) {
    return DeviateAndPickUpIntention.isTypeOf(intention);
  }

  /**
   * @param {DeviateAndPickUpIntention} intention
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const subIntention = new GoPickUpIntention(intention.parcel);

    // Compute in advance the path from parcel to target
    setTimeout(() => this.#pathFromParcelToTarget = this.#pathFinder.search(intention.parcelCoordinates, intention.targetCoordinates), 0);

    const isCompleted = await this.achieveSubIntention(subIntention);

    if (!isCompleted) {
      // The sub-intention was stopped
      this.isStopped = true;
      this.isRunning = false;
      return false;
    }

    this.isRunning = false;
    return true;
  }

  /**
   * @param {Plan} plan 
   */
  static isTypeOf(plan) {
    return plan instanceof this;
  }
}
