/** @typedef Plan @type { GoToPlan | GoPickUpPlan  | GoPutDownPlan } */
/** @typedef Intention @type { import("./intention.js").Intention } */

import { Agent } from "./agent.js";
import { GoPickUpIntention, GoToIntention, GoPutDownIntention } from "./intention.js";

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

      await new Promise(resolve => {
        this.#stopResolver = resolve;
      });

      if (this.#subPlan) {
        await this.#subPlan.stop();
      }
    }
  }
}

export class GoToPlan extends PlanBase {
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

    // TODO: A*?
    const dst = intention.destinationCoordinates;
    const a = this.agent.me.coordinates;

    while (a.x != dst.x || a.y != dst.y) {
      if (this.isStopped) {
        this.isRunning = false;
        return;
      }

      await new Promise(res => setTimeout(res, 100));

      if (this.isStopped) {
        this.isRunning = false;
        return;
      }

      let movedHorizontally;
      let movedVertically;

      if (a.x < dst.x) {
        movedHorizontally = await this.agent.socket.emitMove('right');
      } else if (a.x > dst.x) {
        movedHorizontally = await this.agent.socket.emitMove('left');
      }

      if (movedHorizontally) {
        a.x = movedHorizontally.x;
      }

      if (a.y < dst.y) {
        movedVertically = await this.agent.socket.emitMove('up');
      } else if (a.y > dst.y) {
        movedVertically = await this.agent.socket.emitMove('down');
      }

      if (movedVertically) {
        a.y = movedVertically.y;
      }
    }

    this.isRunning = false;
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
      this.agent.carriedParcelsCount++;
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
