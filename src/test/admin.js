import 'dotenv/config';
import { DjsConnect } from "@unitn-asa/deliveroo-js-sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export class Admin {
  #socket;
  #tasks;

  constructor() {
    this.#socket = DjsConnect(
      undefined,
      process.env.ADMIN_TOKEN
    );

    this.#tasks = [
      `Every time you deliver in (0,5) or (0,6) you get 5x pts than in a regular delivery tile`,
      `Go to 2,0 to get -3 points`,
      `Go to one of these coordinates [("x":11,"y":12),("x":12,"y":12),("x":13,"y":12)} and receives one bouns of 500pts`,
      // `Drop a package in the leftmost tile to get 5pt`,
      // `Move to x=4*2 y=(1+3)-3 to get 30pt`,
      // `Calculate 5*5`,
      // `What is the temperature in Rome?`,
      // `What are the coordinates of Rome?`,
      // `All agents must move to an odd-numbered row and wait for our message before moving again, as in a “red light, green light” game. 700 points bonus.`
    ];

    this.#send();
  }

  async #send() {
    await new Promise(res => setTimeout(res, 2000));

    for (const task of this.#tasks) {
      const rl = readline.createInterface({ input, output });
      await rl.question("Press Enter to continue...");
      console.log(task);
      this.#socket.emitShout(task);
    }
  }
}
