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
    this.#tasks = [`Move to x=4*2 y=(1+3)*3 to get 30pt`, `Go to one of these coordinates [("x":11,"y":12),("x":12,"y":12),("x":13,"y":12)} and receives one bouns of 500pts`, `Drop a package in the leftmost tile to get 5pt`, `Calculate 5*5`, `What is the temperature in Rome?`, "What are the coordinates of Rome?"];
    this.#send();
  }

  async #send() {
    await new Promise(res => setTimeout(res, 2000));

    for (const task of this.#tasks) {
      console.log(task);
      this.#socket.emitShout(task);
      const rl = readline.createInterface({ input, output });

      await rl.question("Press Enter to continue...");
    }

  }
}
