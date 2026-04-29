/** @typedef Plan @type { GoToPlan | GoPickUpPlan  | GoPutDownPlan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import { Agent } from "./agent.js";
import { Coordinates } from "./coordinates.js";
import {
  GoPickUpIntention,
  GoToIntention,
  GoPutDownIntention,
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
    this.#subPlan = this.agent.selectPlan(intention);

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
      this.isStopped = true;

      await new Promise((resolve) => {
        this.#stopResolver = resolve;
      });

      if (this.#subPlan) {
        await this.#subPlan.stop();
      }
    }
  }
}

export class GoToPlan extends PlanBase {
  #pathFinder;

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
  isApplicable(intention) {
    return GoToIntention.isTypeOf(intention);
  }

  /**
   * @param {GoToIntention} intention
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const end = intention.destinationCoordinates;
    let isPathCompleted = false;

    do {
      // TODO: temporarily replace the tile that stopped the movement with 0
      const path = this.#pathFinder.search(this.agent.me.coordinates, end);
      if (path) {
        isPathCompleted = await this.#executePath(path);
      }
    } while (!isPathCompleted && this.isRunning);

    this.isRunning = false;
  }

  /**
   * @param {MapPoint[]} path
   */
  async #executePath(path) {
    const a = this.agent.me;
    let i = 1;

    while (i < path.length) {
      const step = path[i];

      if (this.isStopped) {
        this.isRunning = false;
        return false;
      }

      await new Promise((res) => setTimeout(res, 100));

      if (this.isStopped) {
        this.isRunning = false;
        return false;
      }

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
        if (this.#moveAttemptCount > 10) {
          return false;
        }
      } else {
        this.#moveAttemptCount = 0;
        i++;
      }
    }

    // for (const step of path) {
    //   if (this.isStopped) {
    //     this.isRunning = false;
    //     return false;
    //   }

    //   await new Promise((res) => setTimeout(res, 100));

    //   if (this.isStopped) {
    //     this.isRunning = false;
    //     return false;
    //   }

    //   this.#moveAttemptCount++;

    //   let movedHorizontally;
    //   let movedVertically;

    //   if (a.coordinates.x < step.x) {
    //     movedHorizontally = await this.agent.socket.emitMove('right');
    //   } else if (a.coordinates.x > step.x) {
    //     movedHorizontally = await this.agent.socket.emitMove('left');
    //   }

    //   if (movedHorizontally) {
    //     a.coordinates.x = movedHorizontally.x;
    //   }

    //   if (a.coordinates.y < step.y) {
    //     movedVertically = await this.agent.socket.emitMove('up');
    //   } else if (a.coordinates.y > step.y) {
    //     movedVertically = await this.agent.socket.emitMove('down');
    //   }

    //   if (movedVertically) {
    //     a.coordinates.y = movedVertically.y;
    //   }

    //   if (!movedHorizontally && !movedVertically) {
    //     if (this.#moveAttemptCount > 10) {
    //       console.log(step.x, step.y)
    //       return false;
    //     }
    //   } else {
    //     this.#moveAttemptCount = 0;
    //   }
    // }

    return true;
  }
}

export class GoPickUpPlan extends PlanBase {
  /**
   * @param {Intention} intention
   */
  isApplicable(intention) {
    return GoPickUpIntention.isTypeOf(intention);
  }

  /**
   * @param {GoPickUpIntention} intention
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const subIntention = new GoToIntention(intention.parcelCoordinates);
    await this.achieveSubIntention(subIntention);

    if (this.isStopped) {
      this.isRunning = false;
      return;
    }

    const result = await this.agent.socket.emitPickup();
    if (result.length > 0) {
      this.agent.carriedParcelsCount += 1;
    }

    this.isRunning = false;
  }
}

export class GoPutDownPlan extends PlanBase {
  /**
   * @param {Intention} intention
   */
  isApplicable(intention) {
    return GoPutDownIntention.isTypeOf(intention);
  }

  /**
   * @param {GoPutDownIntention} intention
   */
  async execute(intention) {
    this.isRunning = true;
    this.isStopped = false;

    const subIntention = new GoToIntention(intention.deliveryCoordinates);
    await this.achieveSubIntention(subIntention);

    if (this.isStopped) {
      this.isRunning = false;
      return;
    }

    const result = await this.agent.socket.emitPutdown();
    if (result.length > 0) {
      this.agent.carriedParcelsCount = 0;
    }

    this.isRunning = false;
  }
}
