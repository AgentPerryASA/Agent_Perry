import 'dotenv/config';
import { BDIAgent } from './src/bdi_agent.js';
import { LLMAgent } from './src/llm_agent.js';
import { Admin as Admin } from './src/admin.js';

const token1 = process.env.TOKEN1;
const token2 = process.env.TOKEN2;

if (!token1) {
  console.error("Error: missing TOKEN1 in .env file");
  process.exit(1);
}
if (!token2) {
  console.error("Error: missing TOKEN2 in .env file");
  process.exit(1);
}

const a1 = new BDIAgent(token1);
const a2 = new BDIAgent(token2);

const llm = new LLMAgent(token1);

const server = new Admin();

async function f() {
  await new Promise(res => setTimeout(res, 2000))

  console.log()
  // llm.sendToAgent()

  // await new Promise(res => setTimeout(res, 2000))

  // console.log()
  // a1.sendToLLM()

  // await new Promise(res => setTimeout(res, 2000))

  // console.log()
  // a1.sendToMate()

  // await new Promise(res => setTimeout(res, 2000))

  // console.log()
  // a2.sendToMate()
}
// f()
