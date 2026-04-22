import 'dotenv/config'
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client";

/** @type { function ({x:number, y:number}, {x:number, y:number}): number } */
function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
  const dx = Math.abs(Math.round(x1) - Math.round(x2))
  const dy = Math.abs(Math.round(y1) - Math.round(y2))
  return dx + dy;
}

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

let carriedParcelsCount = 0;

const tiles = new Map();
tiles.set('green', []);
tiles.set('red', []);

socket.onMap((w, h, t) => {
  for (let i = 0; i < t.length; i++) {
    if (t[i].type == '1') {
      tiles.get('green').push({ x: t[i].x, y: t[i].y });
    } else if (t[i].type == '2') {
      tiles.get('red').push({ x: t[i].x, y: t[i].y });
    }
  }
});

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

class GoPutDownOption extends Option {
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

    console.log(this.predicate.type);
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
    await this.subIntention(subOption);

    const result = await socket.emitPickup();
    if (result.length != 0) {
      carriedParcelsCount++;
    }

    console.log("Picked up: ", predicate);
  }
}

class GoPutDownPlan extends Plan {
  isApplicable(predicate) {
    return predicate.type == 'go_put_down';
  }

  async execute(predicate) {
    const subOption = new GoToOption('go_to', predicate.x, predicate.y);
    await this.subIntention(subOption);

    // TODO
    const result = await socket.emitPutdown();
    console.log(result);
    if (result.length != 0) {
      carriedParcelsCount = 0;
    }

    // console.log("Put down: ", predicate);
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

      if (movedVertically) {
        me.y = movedVertically.y;
      }

      // if (!movedHorizontally && !movedVertically) {
      //   console.log('Stucked');
      //   throw 'stucked';
      // }
      await new Promise(res => setTimeout(res, 100));
    }

    // console.log('Target reached');
  }
}

function generateOption() {
  if (carriedParcelsCount >= 4) {
    const redTiles = tiles.get('red');
    let nearest = Number.MAX_VALUE;
    let bestOption;
    for (let i = 0; i < redTiles.length; i++) {
      const x = redTiles[i].x;
      const y = redTiles[i].y;
      let current_d = distance({ x, y }, me)
      if (current_d < nearest) {
        bestOption = { x, y };
        nearest = current_d
      }
    }

    const option = new GoPutDownOption('go_put_down', bestOption.x, bestOption.y);
    agent.pushIntention(option);
    return;
  }

  const options = []
  for (const parcel of parcels.values()) {
    if (!parcel.carriedBy) {
      const option = new GoPickUpOption('go_pick_up', parcel.x, parcel.y, parcel.id);
      options.push(option);
    }
  }

  if (options.length == 0) {
    const greenTiles = tiles.get('green');
    let nearest = Number.MAX_VALUE;
    let bestOption;
    for (let i = 0; i < greenTiles.length; i++) {
      const x = greenTiles[i].x;
      const y = greenTiles[i].y;
      let current_d = distance({ x, y }, me)
      if (current_d < nearest) {
        bestOption = { x, y };
        nearest = current_d
      }
    }

    const option = new GoToOption('go_to', bestOption.x, bestOption.y);
    agent.pushIntention(option);
    return;
  }

  let bestOption;
  let nearest = Number.MAX_VALUE;
  // Go to pick up the closes parcel (best option)
  for (const option of options) {
    if (option.type == 'go_pick_up') {
      let current_d = distance(option, me)
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
planLibrary.push(new GoPutDownPlan());
planLibrary.push(new GoToPlan());

socket.onSensing(generateOption);
socket.onYou(generateOption);

const agent = new AgentReplace();
