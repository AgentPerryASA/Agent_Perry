import 'dotenv/config';
import { BDIAgent } from './src/bdi_agent.js';
import { LLMAgent } from './src/llm_agent.js';
import { webSearch } from './src/utils/llm_tools.js';

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

new BDIAgent(token1);
new BDIAgent(token2);

new LLMAgent(token1);