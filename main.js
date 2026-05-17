import { Agent } from './src/agent.js';

new Agent();

async function g() {
  let i = 0
  setTimeout(() => i = 1, 0)
  await f()
  console.log("g", i)
}

async function f() {
  await new Promise(res => setTimeout(res, 2000))
  console.log("f")
}

// g()