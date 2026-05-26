/** @typedef Plan @type { GoToPlan | GoPickUpPlan  | GoPutDownPlan | DeviateAndPickUpPlan | DeviateUsingAStarPlan | DeviateUsingPlannerPlan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import { start } from "repl";
import { Agent } from "./agent.js";
import { Coordinates } from "./coordinates.js";
import {
  GoPickUpIntention,
  GoToIntention,
  GoPutDownIntention,
  DeviateAndPickUpIntention,
  DeviateUsingPlannerIntention,
  DeviateUsingAStarIntention,
} from "./intention.js";
import { PathFinder, MapPoint } from "./path_finder.js";

class BlockPoint {
  /**@type {MapPoint} */
  #blockPoint;

  /**@type {Number}*/
  #indexOfPath;

  /**@type {Boolean}*/
  #isTileYellow;

  /**
   *
   * @param {MapPoint} blockPoint
   * @param {Number} indexOfPlan
   * @param {Boolean} isTileYellow
   */
  constructor(blockPoint, indexOfPlan, isTileYellow) {
    this.#blockPoint = blockPoint;
    this.#indexOfPath = indexOfPlan;
    this.#isTileYellow = isTileYellow;
  }

  get blockPoint() {
    return this.#blockPoint;
  }

  get indexOfPath() {
    return this.#indexOfPath;
  }

  get isTileYellow() {
    return this.#isTileYellow;
  }
}

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

  get subPlan() {
    const plan = this.#subPlan;
    return plan;
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
        //this.#subPlan = undefined;
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
  #MAX_MOVE_ATTEMPTS = 10;
  #moveAttemptCount;

  /**
   * @param {Agent} agent
   */
  constructor(agent) {
    super(agent);

    this.#pathFinder = agent.internalBelief.pathFinder
      ? agent.internalBelief.pathFinder
      : new PathFinder(this.agent.internalBelief.tileMap.tiles);
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
    let path = intention.path
      ? intention.path // Use the path pre-computed by the intention, if available ...
      : this.#pathFinder.search(this.agent.internalBelief.me.coordinates, end); // ... otherwise search a path

    do {
      if (blockPoint) {
        //Check whether the blockPoint is a 5 or 5! tile: in such case, a crate is present and the planner need to be invoked. The planner need to guide the agent until the next cell in the already existent path that is not a 5 or 5! tile.
        if (blockPoint.isTileYellow) {

          const subIntention = new DeviateUsingPlannerIntention(path, blockPoint.indexOfPath - 1);

          const isCompleted = await this.achieveSubIntention(subIntention);

          if (!isCompleted) {
            // The sub-intention was stopped
            this.isStopped = true;
            this.isRunning = false;
            return false;
          }

          if (this.subPlan && DeviateUsingPlannerPlan.isTypeOf(this.subPlan)) {
            /**@type {DeviateUsingPlannerPlan}*/
            const subPlan = this.subPlan;
            if (subPlan.path) {
              path = subPlan.path;
            }
          }

        } else {
          // Temporarily replace the position of the obstacle with a '0' tile
          const subIntention = new DeviateUsingAStarIntention(end, blockPoint.blockPoint);

          const isCompleted = await this.achieveSubIntention(subIntention);

          if (!isCompleted) {
            // The sub-intention was stopped
            this.isStopped = true;
            this.isRunning = false;
            return false;
          }

          if (this.subPlan && DeviateUsingAStarPlan.isTypeOf(this.subPlan)) {
            /**@type {DeviateUsingAStarPlan}*/
            const subPlan = this.subPlan;
            if (subPlan.path) {
              path = subPlan.path;
            }
          }
        }
      }

      blockPoint = await this.#executePath(path);

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
        console.log("FAIL", movedHorizontally, movedVertically);

        let coordinates = new Coordinates(step.x, step.y);

        if (this.agent.internalBelief.tileMap.getYellowTile(coordinates)) {
          //Stop the execution immediately if the blocking tile is a yellow one
          return new BlockPoint(step, i, true);
        }

        if (this.#moveAttemptCount > this.#MAX_MOVE_ATTEMPTS) {
          // Stop the execution of the path if after 10 consecutive attempts to move the agent is blocked
          return new BlockPoint(step, i, false);
        }

        // Wait for next attempt of move, otherwise the server disconnect you
        await new Promise((res) => setTimeout(res, 50));
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

export class DeviateUsingAStarPlan extends PlanBase {

  /**@type {MapPoint[] | undefined} */
  #path;

  /**
   * @param {Agent} agent
   */
  constructor(agent) {
    super(agent);
  }

  get path() {
    return this.#path;
  }

  /**
   * 
   * @param {DeviateUsingAStarIntention} intention 
   */
  async execute(intention) {
    const pathFinder = this.agent.internalBelief.pathFinder;
    const agentCoordinates = this.agent.internalBelief.me.coordinates;
    const endPointCoordinates = intention.endPointCoordinates;
    const blockPoint = intention.blockPoint;

    let result = undefined;

    if (pathFinder) {
      result = pathFinder.search(
        agentCoordinates,
        endPointCoordinates,
        blockPoint,
      );
    }

    this.#path = result;

    return true;

  }

  /**
   * @param {Intention} intention
   */
  static isApplicable(intention) {
    return DeviateUsingAStarIntention.isTypeOf(intention);
  }

  /**
   * @param {Plan} plan 
   */
  static isTypeOf(plan) {
    return plan instanceof this;
  }

}

export class DeviateUsingPlannerPlan extends PlanBase {
  /**@type {MapPoint[] | undefined} */
  #path;

  /**
   * @param {Agent} agent
   */
  constructor(agent) {
    super(agent);
  }

  get path() {
    return this.#path;
  }

  /**
   * 
   * @param {DeviateUsingPlannerIntention} intention 
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const beliefSet = this.agent.internalBelief.getBeliefForPlanner();
    const stopPointIndexInPath = intention.stopPointIndexInPath;
    const pathFinder = this.agent.internalBelief.pathFinder;
    let path = intention.currentPath;
    let endPoint = new MapPoint({ x: 0, y: 0, w: "perry" });
    let endPointPositionInPath = 0;

    //Remove all part of the path no longer necessary (the one util the current position). Notice that blockPoint does not return the current position, but the tile that was not reached
    path = path.slice(stopPointIndexInPath, path.length);

    //Select what tile to reach: currently, the first non-yellow tile is the new destination, after that, all works as was previously decided
    for (const point of path) {
      const coordinates = new Coordinates(point.x, point.y);
      if (!this.agent.internalBelief.tileMap.getYellowTile(coordinates)) {
        endPointPositionInPath += 1;
        endPoint = point;
        break;
      }
    }

    if (this.isStopped) {
      this.isRunning = false;
      return;
    }

    if (path[0].x == endPoint.x && path[0].y == endPoint.y) {
      // Temporarily replace the position of the obstacle with a '0' tile and calculate an alternative with A* when the start and ending position match
      const endPointCoordinates = new Coordinates(intention.currentPath[intention.currentPath.length - 1].x, intention.currentPath[intention.currentPath.length - 1].y);

      const subIntention = new DeviateUsingAStarIntention(
        endPointCoordinates,
        intention.currentPath[stopPointIndexInPath + 1]
      );

      const isCompleted = await this.achieveSubIntention(subIntention);

      if (!isCompleted) {
        // The sub-intention was stopped
        this.isStopped = true;
        this.isRunning = false;
        return false;
      }

      if (this.isStopped) {
        this.isRunning = false;
        return;
      }

      if (this.subPlan && DeviateUsingAStarPlan.isTypeOf(this.subPlan)) {
        /**@type {DeviateUsingAStarPlan} */
        const subPlan = this.subPlan;
        this.#path = subPlan.path;
        return true;
      }

    } else if (pathFinder) {
      //Recover a plan from the planner
      const plannerPlan = await pathFinder.searchWithPlanner(beliefSet, endPoint);

      if (plannerPlan) {

        if (this.isStopped) {
          this.isRunning = false;
          return;
        }

        //Recover all tile from endPoint to the end of the previous path
        path = path.slice(endPointPositionInPath, path.length);

        const newPath = [];

        //First push the current position of the agent (executePath start from item 1 of the list and not 0)
        newPath.push(
          new MapPoint({
            x: this.agent.internalBelief.me.coordinates.x,
            y: this.agent.internalBelief.me.coordinates.y,
            w: "perry",
          }),
        );

        for (const step of plannerPlan) {
          //Plan result slightly differs between a simple move and a moveCrate move: the first one includes the starting cell and the ending cell, the second also has the cell in which the crate will move to. In both case, the cell of interest is the second (position 1 in args array)

          //Extract x and y coordinates by removing TILE and the _ from the second element of args vector
          const [x, y] = step.args[1].slice(4).split("_").map(Number);

          const mapPoint = new MapPoint({ x, y, w: "perry" });

          //Push the new tile to the array
          newPath.push(mapPoint);
        }

        if (this.isStopped) {
          this.isRunning = false;
          return;
        }

        //Join the new steps until the destination with the remaining part of the previous plan
        this.#path = newPath.concat(path);
        return true;
      } else {

        if (this.isStopped) {
          this.isRunning = false;
          return;
        }

        //No plan found
        return false;
      }
    } else {

      if (this.isStopped) {
        this.isRunning = false;
        return;
      }
      //No pathFinder in agent
      return false;
    }
  }

  /**
   * @param {Intention} intention
   */
  static isApplicable(intention) {
    return DeviateUsingPlannerIntention.isTypeOf(intention);
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

    const path = this.#pathFromDeviation
      ? this.#pathFromDeviation
      : intention.path;
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
    super(agent);
    // TODO: expose pathfinder from beliefs (goto too)
    this.#pathFinder = this.agent.internalBelief.pathFinder;
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
    setTimeout(() => {
      if (this.#pathFinder) {
        this.#pathFromParcelToTarget = this.#pathFinder.search(
          intention.parcelCoordinates,
          intention.targetCoordinates,
        );
      }
    }, 0);

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
