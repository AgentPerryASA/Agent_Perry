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
      `Move to x=4*2 y=(1+3)-3 to get 30pt`,
      `Move to (1,2) and get -50 points`,
      `Drop a package in the rightmost tile to get 5pt`,
      `What is the temperature in Rome?`,
      `What are the coordinates of Rome?`,
      `Calculate 5*5`,
      `Deliver stacks of exactly 3 parcels at a time to double the reward`,
      `Every time you deliver in (0,5) or (0,6) you get 5x pts than in a regular delivery tile`,
      `Go to (2,0) to get 10 points`,
      `All agents must move to an odd-numbered row and wait for our message before moving again, as in a “red light, green light” game. 700 points bonus.`,
      `Team up with an agent to deliver a parcel and get 500 pt`,
      // `All agents must move to an odd-numbered column and wait for our message before moving again, as in a “red light, green light” game. 700 points bonus.`,
      // `All agents must move to an even-numbered row and wait for our message before moving again, as in a “red light, green light” game. 700 points bonus.`,
      // `All agents must move to an even-numbered column and wait for our message before moving again, as in a “red light, green light” game. 700 points bonus.`,
      // `All agents must move to (0, 2) and wait for our message before moving again, as in a “red light, green light” game. 700 points bonus.`
    ];

    this.#send();
  }

  async #send() {
    await new Promise(res => setTimeout(res, 2000));
    const rl = readline.createInterface({ input, output });
    for (const task of this.#tasks) {
      await rl.question("Press Enter to continue...");
      console.log(task);
      this.#socket.emitShout(task);
    }
  }
}
