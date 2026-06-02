import 'dotenv/config';
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk";

export class Admin {
  #socket;

  constructor() {
    this.#socket = DjsConnect(
      undefined,
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijg5MjQwNSIsIm5hbWUiOiJBZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NDIwNTUzOX0.cRfCoH9Aw9tLhv7rcEgjwsnGqx1JKBeJVIGwwXmLVUc"
    );

    this.#send();
  }

  async #send() {
    await new Promise(res => setTimeout(res, 2000));

    // const task = 'Go to one of these coordinates [("x":11,"y":12),("x":12,"y":12),("x":13,"y":12)} and receives one bouns of 500pts';
    // const task = "give me some value"
    const task = `
      input:
      - score: 100
      - max number of parcels: 30
      - max value of parcels: 80
      - number of agents: 4
      - mean of attempts to follow a path: 1
      - random function: cosine

      current parameters:
      - number of possible deviations: 3
      - number of ignored tiles after obstacle: 4
      - delay per movement: 50ms
      - random function: cosine
      - multiplier for parcelMinScore: 0.4
    `;

    console.log("ADMIN:", task);

    this.#socket.emitShout(task);
  }
}
