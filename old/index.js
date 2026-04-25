import 'dotenv/config';
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk/client";

// function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
//   const dx = Math.abs(Math.round(x1) - Math.round(x2))
//   const dy = Math.abs(Math.round(y1) - Math.round(y2))
//   return dx + dy;
// }

const socket = DjsConnect();

// Fetch personal info
const me = { id: '', name: '', x: -1, y: -1, score: 0 };
socket.onYou(({ id, name, x, y, score }) => {
  console.log("k");
  me.id = id;
  me.name = name;
  me.x = x ? x : -1;
  me.y = y ? y : -1;
  me.score = score;
})

// Constantly get parcels around us
const parcels = new Map();
socket.onSensing((sensing) => {
  console.log("hi");
  for (const p of sensing.parcels) {
    parcels.set(p.id, p);
  }
  for (const p of parcels.values()) {
    if (sensing.parcels.map(p => p.id).find(id => id == p.id) == undefined) {
      parcels.delete(p.id);
    }
  }
})

function generateOption() {
  console.log("option generation");

  const options = []
  for (const parcel of parcels.values()) {
    if (!parcel.carriedBy) {
      options.push(['go_pick_up', parcel.x, parcel.y, parcel.id]);
    }
  }

  let bestOption;
  let nearest = Number.MAX_VALUE;
  // Go to pick up the closes parcel (best option)
  for (const option of options) {
    if (option[0] == 'go_pick_up') {
      let [go_pick_up, x, y, id] = option;
      // let current_d = distance({ x, y }, me)
      const dx = Math.abs(Math.round(x) - Math.round(me.x))
      const dy = Math.abs(Math.round(y) - Math.round(me.y))
      let current_d = dx + dy;
      if (current_d < nearest) {
        bestOption = option
        nearest = current_d
      }
    }
  }

  if (bestOption)
    agent.pushIntention(bestOption);
}

class Agent {
  currentIntention = null;

  async pushIntention(option) { }

  async loop() {
    while (true) {
      if (this.currentIntention) {
        console.log(this.currentIntention);
      }
    }
  }
}

class AgentReplace extends Agent {
  async pushIntention(option) {
    this.currentIntention = option;
  }
}

socket.onSensing(generateOption);
socket.onYou(generateOption);

const agent = new AgentReplace();
agent.loop();