import 'dotenv/config';
import { BDIAgent } from './src/bdi_agent.js';

const token1 = process.env.TOKEN1 || "";
const token2 = process.env.TOKEN2 || "";

new BDIAgent(token1);
new BDIAgent(token2);
