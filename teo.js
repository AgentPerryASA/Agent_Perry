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
  // console.log("Personal info fetched: ", me);
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
  // console.log("Parcels perceived: ", parcels);
})

class Agent {
  currentIntention = null;
  #isRunning = false;

  async pushIntention(option) { }

  async loop() {
    while (true) {
      if (this.currentIntention) {
        const predicate = this.currentIntention.predicate;
        const parcel = parcels.get(predicate.id)

        if (parcel && parcel.carriedBy) {
          // TODO: print parcel info once picked up and stop when enter here, compare ids
          console.log(parcel);
          console.log(parcel.carriedBy);
          console.log(me);
          console.log('Skipping intention because no more valid ', predicate.type)
          socket.disconnect()
          continue;
        }

        // TODO: wrong but ok for now
        if (this.#isRunning) {
          continue;
        }
        this.#isRunning = true;
        // Start achieving intention
        await this.currentIntention.achieve()
          // Catch eventual error and continue
          .catch(error => {
            // console.log( 'Failed intention', ...intention.predicate, 'with error:', ...error )
          });
        // this.#isRunning = false;
        console.log("hi");
      }
      await new Promise(res => setTimeout(res, 100));
    }
  }
}

class AgentReplace extends Agent {
  async pushIntention(option) {
    this.currentIntention = new Intention(option);
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
    console.log("k: ", this.predicate.type);
    if (this.#started) {
      return false;
    } else {
      this.#started = true;
    }
    console.log("k2: ", this.predicate.type);

    for (const plan of planLibrary) {
      if (plan.isApplicable(this.predicate)) {
        console.log("k3: ", this.predicate.type);
        plan.execute(this.predicate);
        console.log("k4: ", this.predicate.type);
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
    const subIntentionPredicate = { type: 'go_to', x: predicate.x, y: predicate.y };
    // await this.subIntention(subIntentionPredicate);
    const intention = new Intention(subIntentionPredicate);
    await intention.achieve();
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
      options.push({ type: 'go_pick_up', x: parcel.x, y: parcel.y, id: parcel.id });
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
agent.loop();
