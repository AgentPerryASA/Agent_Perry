import 'dotenv/config';
import { Agent } from './src/agent.js';
import { DjsConnect } from '@unitn-asa/deliveroo-js-sdk';

// new Agent();

const socket = DjsConnect()

async function moveUp() {
  for (let i = 0; i < 10; i++) {
    const res = await socket.emitMove("up");
    if (!res) {
      await new Promise(res => setTimeout(res, 50))
    }
  }
}

async function moveDown() {
  for (let i = 0; i < 10; i++) {
    const res = await socket.emitMove("down");
    if (!res) {
      await new Promise(res => setTimeout(res, 50))
    }
  }
}

async function move() {
  while (true) {
    await moveUp()
    await moveDown()
  }
}

move()