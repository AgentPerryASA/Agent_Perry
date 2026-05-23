/** @typedef Plan @type { GoToPlan | GoPickUpPlan  | GoPutDownPlan | DeviateAndPickUpPlan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import { start } from "repl";
import { Agent } from "./agent.js";
import { Coordinates } from "./coordinates.js";
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

    this.#pathFinder = new PathFinder(this.agent.internalBelief.tileMap.tiles, this.agent);
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
        //Check whether the blockPoint is a 5 or 5! tile: in such case, a crate is present and the planner need to be invoked. The planner need to guide the agent until the next cell in the already existent path that is not a 5 or 5! tile.
        let coordinates = new Coordinates(blockPoint.x,blockPoint.y)
        if(this.agent.internalBelief.tileMap.getYellowTile(coordinates)) {
          console.log("-- PREV plan --\n");
          for(const p of path) {
            console.log(p.x, " ", p.y);
          }
          let endPoint = blockPoint;
          let startPointPositionInPath = 0;
          let endPointPositionInPath = 0;
          //Recover position on the path
          for(const point of path) {
            if(point.x==this.agent.internalBelief.me.coordinates.x && point.y==this.agent.internalBelief.me.coordinates.y) {
              break;
            }
            startPointPositionInPath+=1;
          }

          console.log("blocked at ",path[startPointPositionInPath].x,path[startPointPositionInPath].y)
          path = path.slice(startPointPositionInPath,path.length)
          console.log("-- SLICED plan --\n");
          for(const p of path) {
            console.log(p.x, " ", p.y);
          }
          for(const point of path) {
            coordinates=new Coordinates(point.x,point.y)
            if(!this.agent.internalBelief.tileMap.getYellowTile(coordinates)) {
              endPointPositionInPath+=1;
              endPoint=point;
              break
            }
          }
          console.log("Reaching: ",endPoint.x,endPoint.y)

          if(path[0].x==endPoint.x && path[0].y==endPoint.y) {
            // Temporarily replace the position of the obstacle with a '0' tile
            path = this.#pathFinder.search(this.agent.internalBelief.me.coordinates, end, blockPoint);
          } else {
            //Recover a plan from the planner
            const plannerPlan = await this.#pathFinder.searchWithPlanner(endPoint);

            if(plannerPlan) {
              //Remove all nodes between the starting point and the destination
              path = path.slice(endPointPositionInPath,path.length)
              let newPath = [];

              //First push the current position of the agent
              newPath.push(new MapPoint({x: this.agent.internalBelief.me.coordinates.x,y: this.agent.internalBelief.me.coordinates.y,w: "test"}))

              for(const step of plannerPlan) {
                //Plan result slightly differs between a simple move and a moveCrate move: the first one includes the starting cell and the ending cell, the second also has the cell in which the crate will move to. In both case, the cell of interest is the second (position 1 in args array)
                
                //Extract x and y coordinates by removing TILE and the _ from the second element of args vector
                const [x,y] = step.args[1].slice(4).split("_").map(Number);
                
                //TODO: consider
                const mapPoint = new MapPoint({x,y,w: 'perry'})

                newPath.push(mapPoint);
              }
              path = newPath.concat(path);
            }
            
            console.log("-- NEXT plan --\n");
            for(const p of path) {
              console.log(p.x, " ", p.y);
            }
          }

        } else {
          // Temporarily replace the position of the obstacle with a '0' tile
          path = this.#pathFinder.search(this.agent.internalBelief.me.coordinates, end, blockPoint);
        }
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
      if(this.#pathFinder) {
        this.#pathFromParcelToTarget = this.#pathFinder.search(intention.parcelCoordinates, intention.targetCoordinates)
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
