import 'dotenv/config'
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client";

const socket = DjsConnect();

// Fetch personal info
const me = { id: '', name: '', x: -1, y: -1, score: 0 };
socket.onYou(({ id, name, x, y, score }) => {
  me.id = id;
  me.name = name;
  me.x = x ? x : -1;
  me.y = y ? y : -1;
  me.score = score;
})

// Constantly get parcels around us
const parcels = new Map();
socket.onSensing(sensing => {
  for (const p of sensing.parcels) {
    parcels.set(p.id, p);
  }
  for (const p of parcels.values()) {
    if (sensing.parcels.map(p => p.id).find(id => id == p.id) == undefined) {
      parcels.delete(p.id);
    }
  }
})

class Option {
  type;

  constructor(type) {
    this.type = type;
  }

  baseIsEqual(option) {
    return this.type == option.type;
  }
}

class GoPickUpOption extends Option {
  x;
  y;
  id;

  constructor(type, x, y, id) {
    super(type);

    this.x = x;
    this.y = y;
    this.id = id;
  }

  isEqual(option) {
    return this.baseIsEqual(option) && this.id == option.id;
  }
}

class GoToOption extends Option {
  x;
  y;

  constructor(type, x, y) {
    super(type);

    this.x = x;
    this.y = y;
  }

  isEqual(option) {
    return this.baseIsEqual(option) && this.x == option.x && this.y == option.y;
  }
}

class Agent {
  currentIntention = null;
  #isRunning = false;

  async pushIntention(option) { }

  async achieve() {
    const predicate = this.currentIntention.predicate;
    const parcel = parcels.get(predicate.id)

    if (parcel && parcel.carriedBy) {
      console.log('Skipping intention because no more valid ', predicate.type)
      return;
    }

    await this.currentIntention.achieve();
  }
}

class AgentReplace extends Agent {
  async pushIntention(option) {
    if (this.currentIntention && this.currentIntention.predicate.isEqual(option))
      return;

    this.currentIntention = new Intention(option);

    await this.achieve();
  }
}

class Intention {
  currentPlan = null;
  predicate;
  #started = false;

  constructor(predicate) {
    this.predicate = predicate;
  }

  async achieve() {
    // Cannot start twice
    if (this.#started) {
      return false;
    } else {
      this.#started = true;
    }

    for (const plan of planLibrary) {
      if (plan.isApplicable(this.predicate)) {
        await plan.execute(this.predicate);
      }
    }
  }
}

class Plan {
  isApplicable(predicate) { }

  async execute(predicate) { }

  async subIntention(predicate) {
    const intention = new Intention(predicate);
    await intention.achieve();
  }
}

class GoPickUpPlan extends Plan {
  isApplicable(predicate) {
    return predicate.type == 'go_pick_up';
  }

  async execute(predicate) {
    const subOption = new GoToOption('go_to', predicate.x, predicate.y);
    const subIntention = new Intention(subOption);
    await subIntention.achieve();

    await socket.emitPickup();
    console.log("Picked up: ", predicate);
  }
}

class GoToPlan extends Plan {
  isApplicable(predicate) {
    return predicate.type == 'go_to';
  }

  async execute(predicate) {
    const dst = { x: predicate.x, y: predicate.y };

    while (me.x != dst.x || me.y != dst.y) {
      let movedHorizontally;
      let movedVertically;

      if (me.x < dst.x) {
        movedHorizontally = await socket.emitMove('right');
      } else if (me.x > dst.x) {
        movedHorizontally = await socket.emitMove('left');
      }

      if (movedHorizontally) {
        me.x = movedHorizontally.x;
      }

      if (me.y < dst.y) {
        movedVertically = await socket.emitMove('up');
      } else if (me.y > dst.y) {
        movedVertically = await socket.emitMove('down');
      }

      // console.log(movedVertically);
      if (movedVertically) {
        me.y = movedVertically.y;
      }

      // if (!movedHorizontally && !movedVertically) {
      //   console.log('Stucked');
      //   throw 'stucked';
      // }
      await new Promise(res => setTimeout(res, 100));
    }

    console.log('Target reached');
  }
}

function generateOption() {
  const options = []
  for (const parcel of parcels.values()) {
    if (!parcel.carriedBy) {
      const option = new GoPickUpOption('go_pick_up', parcel.x, parcel.y, parcel.id);
      options.push(option);
      // options.push({ type: 'go_pick_up', x: parcel.x, y: parcel.y, id: parcel.id });
    }
  }

  let bestOption;
  let nearest = Number.MAX_VALUE;
  // Go to pick up the closes parcel (best option)
  for (const option of options) {
    if (option.type == 'go_pick_up') {
      // let current_d = distance({ x, y }, me)
      const dx = Math.abs(Math.round(option.x) - Math.round(me.x))
      const dy = Math.abs(Math.round(option.y) - Math.round(me.y))
      let current_d = dx + dy;
      if (current_d < nearest) {
        bestOption = option
        nearest = current_d
      }
    }
  }

  if (bestOption) {
    agent.pushIntention(bestOption);
  }
}

const planLibrary = [];
planLibrary.push(new GoPickUpPlan());
planLibrary.push(new GoToPlan());

socket.onSensing(generateOption);
socket.onYou(generateOption);

const agent = new AgentReplace();
// agent.loop();
