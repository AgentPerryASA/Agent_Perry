import 'dotenv/config';
import { BDIAgent } from '../bdi_agent.js';
import { LLMAgent } from '../llm_agent.js';
import { Admin } from './admin.js';
import { Coordinates } from '../utils/coordinates.js';

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

new Admin();
