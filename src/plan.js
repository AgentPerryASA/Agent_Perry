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

class NearbyAgent {
  /**@type {Boolean}*/
  #nearbyAgentDetected;

  /**@type {Number | undefined}*/
  #aheadTileIndex;

  /**
   * 
   * @param {Boolean} nearbyAgentDetected 
   * @param {Number | undefined} aheadTileIndex 
   */
  constructor(nearbyAgentDetected, aheadTileIndex) {
    this.#nearbyAgentDetected = nearbyAgentDetected;
    this.#aheadTileIndex = aheadTileIndex;
  }

  get nearbyAgentDetected() {
    return this.#nearbyAgentDetected;
  }

  get aheadTileIndex() {
    return this.#aheadTileIndex;
  }
}

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
   * @param {Number} indexOfPath
   * @param {Boolean} isTileYellow
   */
  constructor(blockPoint, indexOfPath, isTileYellow) {
    this.#blockPoint = blockPoint;
    this.#indexOfPath = indexOfPath;
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
  #CELL_TO_CHECK_FOR_AGENTS = 4;
  #moveAttemptCount;
  /**
  * Map of alternative path. Id is String(tile.x)+String(tile.y). Contains the path or a promise
  * @type {Map<String,Promise<MapPoint[]>>}
  * */
  #alternativePath;

  /**
   * @param {Agent} agent
   */
  constructor(agent) {
    super(agent);

    this.#pathFinder = agent.internalBelief.pathFinder
      ? agent.internalBelief.pathFinder
      : new PathFinder(this.agent.internalBelief.tileMap.tiles);
    this.#moveAttemptCount = 0;
    this.#alternativePath = new Map();
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
        let wasPlannerUsed = false;
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
              wasPlannerUsed = true;
            }
          }

        }

        if (!wasPlannerUsed) {
          // Temporarily replace the position of the obstacle with a '0' tile
          // This will be done also in case the planner didn't found a plan because the starting and ending tiles were the same
          const blockPointList = [blockPoint.blockPoint];
          const subIntention = new DeviateUsingAStarIntention(end, blockPointList);

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
   * @param {Number} startIndex 
   */
  #searchNearbyAgent(path, startIndex) {
    for (let i = startIndex; i < startIndex + this.#CELL_TO_CHECK_FOR_AGENTS; i += 1) {
      if (i < path.length) {
        const aheadTileCoordinates = new Coordinates(path[i].x, path[i].y);
        if (this.agent.internalBelief.isTileWithAgent(aheadTileCoordinates)) {
          return new NearbyAgent(true, i);
        }
      }
    }

    return new NearbyAgent(false, undefined);
  }

  /**
  * @param {MapPoint[]} path
  * @param {Number} aheadTileIndex
  */
  async #searchAndStoreDeviation(path, aheadTileIndex) {
    //Retrieve the tile for which a deviation is needed
    const aheadTile = path[aheadTileIndex];
    const aheadTileCoordinatesToString = String(aheadTile.x) + String(aheadTile.y);

    //Retrieve position when the deviation will be needed
    const futureAgentPosition = path[aheadTileIndex - 1];
    const futureAgentPositionCoordinates = new Coordinates(futureAgentPosition.x, futureAgentPosition.y);

    //Retrieve the ending point
    const endPoint = path[path.length - 1];
    const endPointCoordinates = new Coordinates(endPoint.x, endPoint.y);

    //Preparing list with all tiles to ignore: CELL_TO_CHECK_FOR_AGENTS tiles of the path after the blocked tile
    const tilesToIgnoreList = [];
    for (let i = 0; i < this.#CELL_TO_CHECK_FOR_AGENTS; i += 1) {

      //Ignore selected tiles (except for the destination)
      if (i + aheadTileIndex < path.length - 1) {

        tilesToIgnoreList.push(path[i + aheadTileIndex]);

      }

    }

    //Calculate deviation using A*
    const subIntention = new DeviateUsingAStarIntention(endPointCoordinates, tilesToIgnoreList, futureAgentPositionCoordinates);

    //Insert an entry to alternativePath: this signals that an alternative path is or will be available
    const futurePromise = new Promise(res => {
      this.achieveSubIntention(subIntention).then((result) => {

        //Get a copy of the subPlan before it could be overwritten
        const subPlan = /**@type {DeviateUsingAStarPlan} */(this.subPlan);

        if (result && subPlan && subPlan.path) {
          res(subPlan.path);
        } else {
          res([]);
        }
      });
    });

    //Wait 10 ms to allow safe storing of subPlan
    await new Promise(res => setTimeout(res, 10));

    this.#alternativePath.set(aheadTileCoordinatesToString, futurePromise);
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

      let step = path[i];

      let coordinates = new Coordinates(step.x, step.y);

      if (!step.insertedByPlanner && this.agent.internalBelief.tileMap.getYellowTile(coordinates) && this.agent.internalBelief.isTileWithCrate(coordinates)) {
        //Stop the execution immediately if the tile was not set by the planner, it is yellow and has a crate over it: this avoid calling the planner if the tile is yellow but no crate are on it, therefore for it being a walkable tile
        return new BlockPoint(step, i, true);
      }

      //Check for the present of an agent in next tiles. First check for a future tile two tile ahead, next check the next cell (situation could have change and the change of path could be no longer necessary or it could require an updated one). To repeat the search later without declaring another variable, this is not left as a const
      let nearbyAgent = this.#searchNearbyAgent(path, i);

      if (nearbyAgent.nearbyAgentDetected && nearbyAgent.aheadTileIndex) {
        await this.#searchAndStoreDeviation(path, nearbyAgent.aheadTileIndex);
      }

      //Check if the current "next" tile has a deviation: in such case check whether the agent is still there or in one of the next tiles, if not ignores. While this search is perfectly equivalent to the one before, the environment change very frequently
      const currentTileCoordinatesToString = String(path[i].x) + String(path[i].y);
      const wasDeviationPresent = this.#alternativePath.get(currentTileCoordinatesToString);

      nearbyAgent = this.#searchNearbyAgent(path, i);

      if (wasDeviationPresent && nearbyAgent.nearbyAgentDetected) {

        path = await wasDeviationPresent;
        if (path.length == 0) {
          return;
        }

        i = 1;
        step = path[i];

      }

      //After taking the deviation, it is no longer needed: clear. Additionally, if the deviation was not take this still means it is no longer necessary
      this.#alternativePath.delete(currentTileCoordinatesToString);

      //Finally, move the agent
      if (step.x != a.coordinates.x || step.y != a.coordinates.y) {
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
          console.log("FAIL", movedHorizontally, movedVertically, "from", this.agent.internalBelief.me.coordinates.x, this.agent.internalBelief.me.coordinates.y, "to", step.x, step.y);

          if (this.agent.internalBelief.tileMap.getYellowTile(coordinates)) {
            //Stop the execution if the tile is yellow: if this happen here, this means that something in the environment has changed and planner has to be invoked again to go over the crate
            return new BlockPoint(step, i, true);
          }

          if (this.#moveAttemptCount > this.#MAX_MOVE_ATTEMPTS) {
            // Stop the execution of the path if after 10 consecutive attempts to move the agent is blocked
            return new BlockPoint(step, i, false);
          }

          // Wait for next attempt of move, otherwise the server disconnect you
          await new Promise((res) => setTimeout(res, 100));
        } else {
          // Agent moved
          this.#moveAttemptCount = 0;
          i++;
          await new Promise((res) => setTimeout(res, 10));
        }
      } else {
        i += 1;
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
    const agentCoordinates = intention.startPointCoordinates ? intention.startPointCoordinates : this.agent.internalBelief.me.coordinates;
    const endPointCoordinates = intention.endPointCoordinates;
    const blockPoint = intention.blockPoints;

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

      this.#path = undefined;
      return true;

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
          }, true),
        );

        for (const step of plannerPlan) {
          //Plan result slightly differs between a simple move and a moveCrate move: the first one includes the starting cell and the ending cell, the second also has the cell in which the crate will move to. In both case, the cell of interest is the second (position 1 in args array)

          //Extract x and y coordinates by removing TILE and the _ from the second element of args vector
          const [x, y] = step.args[1].slice(4).split("_").map(Number);

          const mapPoint = new MapPoint({ x, y, w: "perry" }, true);

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
