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

    const task = 'Go to one of these coordiates [("x":11,"y":12),("x":12,"y":12),("x":13,"y":12)} and receives one bouns of 500pts';

    console.log("ADMIN:", task);

    this.#socket.emitShout(task);
  }
}
