import 'dotenv/config';
import { BDIAgent } from '../bdi_agent.js';
import { LLMAgent } from '../llm_agent.js';
import { Admin } from './admin.js';

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

// const str = `- number of possible deviations to pick up a parcel: 4
//   - number of tiles to ignore after an obstacle on the path: 3
//   - delay in sending movement request to the server: 30ms
//   - type of function to randomize the destination: hyperbola
//   - multiplier m to get parcelMinScore = parcelMaxScore * m: 0.5`.trim()
// const l = str.split(/\r?\n|\r|\n/g)
// console.log(l.length)
// console.log(l)
