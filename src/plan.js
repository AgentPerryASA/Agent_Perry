/** @typedef Plan @type { GoToPlan | GoPickUpPlan  | GoPutDownPlan | DeviatePlan | DeviateAndPickUpPlan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import { Agent } from "./agent.js";
import { Coordinates } from "./coordinates.js";
import {
  GoPickUpIntention,
  GoToIntention,
  GoPutDownIntention,
  DeviateAndPickUpIntention,
  DeviateIntention,
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
    if (!this.#subPlan) {
      //Do not regenerate the plan if this already exists: means a recovery in in action
      this.#subPlan = this.agent.selectPlan(intention);
    }

    if (this.#subPlan) {
      if (this.isStopped) {
        this.#isRunning = false;
        return;
      }
      // @ts-ignore
      await this.#subPlan.execute(intention);
    }
  }

  async stop() {
    if (this.#isRunning) {
      if (this.#subPlan) {
        await this.#subPlan.stop();
      }

      this.isStopped = true;

      await new Promise((resolve) => {
        this.#stopResolver = resolve;
      });
    }
  }
}

export class GoToPlan extends PlanBase {
  #pathFinder;

  #MAX_MOVE_ATTEMPTS = 10
  #moveAttemptCount;
  /**@type {MapPoint | undefined} */
  #bp;

  /**@type {MapPoint[] | undefined}*/
  #completePath;

  /**
   * @param {Agent} agent
   */
  constructor(agent) {
    super(agent);

    this.#pathFinder = new PathFinder(this.agent.internalBelief.tileMap.tiles);
    this.#moveAttemptCount = 0;

    this.#completePath = undefined;
    this.#bp = undefined;
  }

  /**
   * @param {Intention} intention
   */
  static isApplicable(intention) {
    return GoToIntention.isTypeOf(intention);
  }

  /**
   * 
   * @param {MapPoint[] | undefined} path 
   * @param {MapPoint | undefined} blockPoint 
   */
  #saveContext(path, blockPoint) {
    this.#completePath = path;
    this.#bp = blockPoint;
  }

  /**
   * @param {GoToIntention} intention
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const end = intention.destinationCoordinates;
    let path = undefined;

    // Check whether a path was already calculated (therefore, a recovery was initiated), otherwise calculate a new path
    if (this.#completePath) {
      path = this.#completePath;
    } else {
      path = intention.path ? intention.path : this.#pathFinder.search(this.agent.internalBelief.me.coordinates, end);
    }

    // let blockPointTuple;
    let blockPoint = this.#bp;

    // Reset situation for eventual future stop
    this.#bp = undefined;
    this.#completePath = undefined;

    do {
      if (blockPoint) {
        // Temporarily replace the position of the obstacle with a '0' tile
        path = this.#pathFinder.search(this.agent.internalBelief.me.coordinates, end, blockPoint);

        if (this.isStopped) {
          // Save context for eventual recovery
          this.#saveContext(path, blockPoint);

          this.isRunning = false;
          return false;
        }

      }

      blockPoint = await this.#executePath(path)

      if (this.isStopped) {
        // Save context for eventual recovery
        this.#saveContext(path, blockPoint);

        this.isRunning = false;
        return false;
      }

      // Repeat the loop if the plan is still running but the path is not completed (due to a block on the path)
    } while (blockPoint && this.isRunning);

    if (this.isStopped) {
      this.isRunning = false;
      return false;
    }

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
      await new Promise(res => setTimeout(res, 70));
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
}

export class GoPickUpPlan extends PlanBase {
  /**@type {Intention | undefined} */
  #gti;

  /**
   * @param {Agent} agent 
   */
  constructor(agent) {
    super(agent);
    this.#gti = undefined;
  }

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

    //Do not regenerate a new subIntention if it was already generated, a recovery could be in progress
    const subIntention = this.#gti ? this.#gti : new GoToIntention(intention.parcelCoordinates);
    if (!this.#gti) {
      this.#gti = subIntention;
    }

    await this.achieveSubIntention(subIntention);

    if (this.isStopped) {
      this.isRunning = false;
      return false;
    }

    const result = await this.agent.socket.emitPickup();

    if (result.length > 0) {
      this.agent.internalBelief.carriedParcelsCount += 1;
    }

    if (this.isStopped) {
      this.isRunning = false;
      return false;
    }

    this.isRunning = false;
    return true;
  }
}

export class DeviateAndPickUpPlan extends PlanBase {
  #firstPartCompleted;
  /**@type {Intention | undefined} */
  #gtig;
  /**@type {Intention | undefined} */
  #gtib;

  /**
   * @param {Agent} agent 
   */
  constructor(agent) {
    super(agent)
    this.#gtib = undefined;
    this.#gtib = undefined;
    this.#firstPartCompleted = false;
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

    //For some reason the coordinates of the intention get overwritten. Until the problem is found this fix the issue
    const returnC = new Coordinates(intention.returnCoordinates.x, intention.returnCoordinates.y)

    let subIntention;

    if (!this.#firstPartCompleted) {
      subIntention = this.#gtig ? this.#gtig : new GoToIntention(intention.parcelCoordinates);

      if (!this.#gtig) {
        this.#gtig = subIntention;
      }

      await this.achieveSubIntention(subIntention);

      if (this.isStopped) {
        this.isRunning = false;
        return false;
      }

      const result = await this.agent.socket.emitPickup();

      if (result.length > 0) {
        this.agent.internalBelief.carriedParcelsCount += 1;
        this.#firstPartCompleted = true;
      }

      if (this.isStopped) {
        this.isRunning = false;
        return false;
      }
    }


    console.log("Going back to ", returnC, "from", intention.parcelCoordinates)
    subIntention = this.#gtib ? this.#gtib : new GoToIntention(returnC);
    if (!this.#gtib) {
      this.#gtib = subIntention;
    }
    await this.achieveSubIntention(subIntention)

    console.log("end")

    this.isRunning = false;
    return true;
  }
}

export class GoPutDownPlan extends PlanBase {
  /**@type {undefined | Intention }*/
  #gti = undefined;
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

    const subIntention = this.#gti ? this.#gti : new GoToIntention(intention.deliveryCoordinates, intention.path);
    if (!this.#gti) {
      this.#gti = subIntention;
    }

    await this.achieveSubIntention(subIntention);

    if (this.isStopped) {
      this.isRunning = false;
      return false;
    }

    const result = await this.agent.socket.emitPutdown();

    if (result.length > 0) {
      this.agent.internalBelief.carriedParcelsCount = 0;
    }

    if (this.isStopped) {
      this.isRunning = false;
      return false;
    }

    console.log("reset")
    this.agent.internalBelief.deviateAndPickupIntentionCounter = 0;
    this.isRunning = false;
    return true;
  }
}

export class DeviatePlan extends PlanBase {
  #pathFinder;

  /**
   * @param {Agent} agent 
   */
  constructor(agent) {
    super(agent)
    // TODO: expose pathfinder from beliefs (goto too)
    this.#pathFinder = new PathFinder(this.agent.internalBelief.tileMap.tiles);
  }

  /**
   * @param {Intention} intention
   */
  static isApplicable(intention) {
    return DeviateIntention.isTypeOf(intention);
  }

  /**
   * @param {DeviateIntention} intention
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const subIntention = new GoPickUpIntention(intention.parcel);

    // Compute in advance the path from parcel to target
    let nextPath;
    setTimeout(() => nextPath = this.#pathFinder.search(intention.parcelCoordinates, intention.targetCoordinates), 0);

    await this.achieveSubIntention(subIntention);

    if (this.isStopped) {
      this.isRunning = false;
      return false;
    }

    // TODO: uses nextPath for original intention in some way

    this.isRunning = false;
    return true;
  }
}
