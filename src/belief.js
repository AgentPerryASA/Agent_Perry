/** @typedef IOParcel @type {import("@unitn-asa/deliveroo-js-sdk").IOParcel}} */
/**@typedef IOTile @type {import("@unitn-asa/deliveroo-js-sdk").IOTile} */
/**@typedef IOConfig @type {import("@unitn-asa/deliveroo-js-sdk").IOConfig} */
/**@typedef IOAgent @type {import("@unitn-asa/deliveroo-js-sdk").IOAgent} */
/**@typedef IOCrate @type {import("@unitn-asa/deliveroo-js-sdk/types/IOSensing.js").IOCrate}*/

import { Beliefset } from "@unitn-asa/pddl-client";
import { PathFinder } from "./path_finder.js";
import { GoToPlan, GoPickUpPlan, GoPutDownPlan, DeviateAndPickUpPlan, DeviateUsingAStarPlan, DeviateUsingPlannerPlan, LLMGreenRedLightPlan } from "./plan.js";
import { GoToInteractionData, LLMUpdatedParameters, Parcel, WorldMap } from "./utils/beliefs_utils.js";
import { TargetTile } from "./utils/path_utils.js";
import { Me } from "./me.js";
import { Coordinates } from "./utils/coordinates.js";
import { CosineRandomFunction, RandomFunction } from "./utils/random_function.js";

export class Beliefs {
  /**@type {PathFinder | undefined}*/
  #pathFinder;

  /**@type {Parcel[]} */
  #parcelList;

  /**@type {WorldMap} */
  #tileMap;

  /**@type {number} */
  #parcelAvgScore;

  /**@type {number} */
  #parcelVarScore;

  /**@type {number} */
  #parcelMinScore;

  /**@type {number}*/
  #maxParcelsPresent;

  /**@type {number} */
  #gameSpeed;

  /**@type {IOAgent[]} */
  #nearAgentList;

  /**@type {number}*/
  #parcelDecayTimerValue;

  /**@type {number}*/
  #deviateAndPickupIntentionCounter;

  /**@type {Me}*/
  #me;

  /**@type {Map<string,Coordinates>} */
  #tileWithCrateMap;

  /**@type {Beliefset} */
  #plannerBeliefSet;

  /**@type {(typeof GoToPlan | typeof GoPickUpPlan | typeof GoPutDownPlan | typeof DeviateAndPickUpPlan | typeof DeviateUsingAStarPlan | typeof DeviateUsingPlannerPlan | typeof LLMGreenRedLightPlan)[]}*/
  #planLibrary;

  /** @type { TargetTile | undefined } */
  #currentTargetTile;

  /**
   * A separate map keep track of all encountered agent. While it could be merged with nearAgentList, keeping them two separate entities allow faster search later
   * @type {Map<string,IOAgent>}
  */
  #encounteredAgentsIdList;

  /**
   * @type {GoToInteractionData}
  */
  #goToInteractionData;

  /**@type {number}*/
  #numberOfCheckedTilesForAgentPresence;

  /**@type {number}*/
  #numberOfIgnoredTilesForAgentPresence;

  /**@type {number}*/
  #numberOfPossibleDeviations;

  /**@type {number}*/
  #parcelMinScoreMultiplier;

  /**@type {string} */
  #randomFunctionType;

  /**@type {Map<string,string>}*/
  #enhancedDeliveryTilesMap;

  /**@type {boolean}*/
  #isWaitingForGreenLight;

  /**@type {string}*/
  #additionalInfoForLLMTuning;

  constructor() {
    this.#parcelList = [];
    this.#tileMap = new WorldMap([], [], [], []);
    this.#parcelAvgScore = 0;
    this.#parcelVarScore = 0;
    this.#parcelMinScore = 0;
    this.#maxParcelsPresent = 0;
    this.#gameSpeed = 0;
    this.#nearAgentList = [];
    this.#parcelDecayTimerValue = 0;
    this.#deviateAndPickupIntentionCounter = 0;
    this.#pathFinder = undefined;
    this.#me = new Me("", "", 0, 0, new Coordinates(0, 0));
    this.#tileWithCrateMap = new Map();
    this.#plannerBeliefSet = new Beliefset();
    this.#planLibrary = [GoToPlan, GoPickUpPlan, GoPutDownPlan, DeviateAndPickUpPlan, DeviateUsingAStarPlan, DeviateUsingPlannerPlan, LLMGreenRedLightPlan];
    this.#encounteredAgentsIdList = new Map();
    this.#goToInteractionData = new GoToInteractionData();
    this.#numberOfCheckedTilesForAgentPresence = 4;
    this.#numberOfIgnoredTilesForAgentPresence = 2;
    this.#numberOfPossibleDeviations = 5;
    this.#parcelMinScoreMultiplier = 0.4;
    this.#enhancedDeliveryTilesMap = new Map();
    this.#randomFunctionType = CosineRandomFunction.TYPE;
    RandomFunction.setFunctionType(this.#randomFunctionType);
    this.#isWaitingForGreenLight = false;
    this.#additionalInfoForLLMTuning = "";
  }

  get planLibrary() {
    return this.#planLibrary;
  }

  get currentTargetTile() {
    return this.#currentTargetTile;
  }

  get tileMap() {
    return this.#tileMap;
  }

  get parcelList() {
    return this.#parcelList;
  }

  get parcelMinScore() {
    return this.#parcelMinScore;
  }

  get me() {
    return this.#me;
  }

  get gameSpeed() {
    return this.#gameSpeed;
  }

  get parcelDecayTimerValue() {
    return this.#parcelDecayTimerValue;
  }

  get deviateAndPickupIntentionCounter() {
    return this.#deviateAndPickupIntentionCounter;
  }

  get pathFinder() {
    return this.#pathFinder;
  }

  get goToInteractionData() {
    return this.#goToInteractionData;
  }

  get numberOfCheckedTilesForAgentPresence() {
    return this.#numberOfCheckedTilesForAgentPresence;
  }

  get numberOfIgnoredTilesForAgentPresence() {
    return this.#numberOfIgnoredTilesForAgentPresence;
  }

  get numberOfPossibleDeviations() {
    return this.#numberOfPossibleDeviations;
  }

  get enhancedDeliveryTilesMap() {
    return this.#enhancedDeliveryTilesMap;
  }

  get isWaitingForGreenLight() {
    return this.#isWaitingForGreenLight;
  }

  get additionalInfoForLLMTuning() {
    return this.#additionalInfoForLLMTuning;
  }

  set deviateAndPickupIntentionCounter(value) {
    this.#deviateAndPickupIntentionCounter = value;
  }

  set currentTargetTile(tile) {
    this.#currentTargetTile = tile;
  }

  set isWaitingForGreenLight(value) {
    this.#isWaitingForGreenLight = value;
  }

  set additionalInfoForLLMTuning(value) {
    this.#additionalInfoForLLMTuning = value;
  }

  /**
   * @param {IOAgent} agent
   */
  updateMe(agent) {
    // No, nothing to do with despicable me
    // Skip intermediate values (0.6 or 0.4)
    if (
      agent.x != undefined &&
      agent.x % 1 == 0 &&
      agent.y != undefined &&
      agent.y % 1 == 0
    ) {
      if (this.#me.id == "") {
        this.#me = new Me(
          agent.id,
          agent.name,
          agent.score,
          agent.penalty,
          new Coordinates(agent.x, agent.y),
        );
      } else {
        //For reasons regarding the startup of the agent, the first update must recreate the me information. Otherwise, let me update itself.
        this.#me.updateMe(agent);
      }
    }
  }

  /**
   * @param {LLMUpdatedParameters} parameters 
   */
  updateParameters(parameters) {
    this.#numberOfPossibleDeviations = parameters.numberOfPossibleDeviations;

    this.#numberOfCheckedTilesForAgentPresence = parameters.numberOfCheckedTilesForAgentPresence;

    this.#numberOfIgnoredTilesForAgentPresence = parameters.numberOfIgnoredTilesForAgentPresence;

    this.#me.agentMovementDelay = parameters.movementDelay;

    this.#randomFunctionType = parameters.randomFunction;
    RandomFunction.setFunctionType(this.#randomFunctionType);

    this.#parcelMinScoreMultiplier = parameters.minScoreMultiplier;
  }

  /**
   * @param {IOParcel[] | undefined} sensedParcelsList
   */
  reviseParcelList(sensedParcelsList) {
    const endTime = Date.now() + 0.01 * this.#parcelList.length;

    /**@type {Map<string,IOParcel>} */
    let sensedParcelsMap = new Map();
    if (sensedParcelsList != undefined) {
      sensedParcelsMap = new Map(
        sensedParcelsList.map((parcel) => [parcel.id, parcel]),
      );
    }

    for (let i = 0; i < this.#parcelList.length; i += 1) {
      const currentParcelFromBelief = this.#parcelList[i]; // Parcel from belief
      const currentParcelFromSensedList = sensedParcelsMap.get(
        currentParcelFromBelief.parcel.id,
      ); // Parcel from sensed list

      if (currentParcelFromSensedList != undefined) {

        if (currentParcelFromSensedList.carriedBy == this.me.id) {
          //If the sensed parcel is carried by perry, update the carriedParcelsMap. This additional check keeps the list updated, but the element is originally added during the pickup of one or more parcels, at least the id since the returned list of picked up parcel does not include the parcel itself but only the id
          this.#me.carriedParcelsMap.set(currentParcelFromSensedList.id, currentParcelFromSensedList);
        }

        // If the current parcel was in the sensed list, then update value with that.
        // A check to see if it is now carried is necessary, as well as a check to see whether
        // the parcel is still good to be picked up (>= min value).

        //Check if the parcel is not carried by anyone, has a value higher than a minimum score an is in a green tile (ignore parcel putted down by other agents)
        if (
          currentParcelFromSensedList.carriedBy == undefined &&
          currentParcelFromSensedList.reward >= this.#parcelMinScore &&
          this.#tileMap.getGreenTile(new TargetTile(new Coordinates(currentParcelFromSensedList.x, currentParcelFromSensedList.y)))
        ) {
          currentParcelFromBelief.parcel = currentParcelFromSensedList;
          currentParcelFromBelief.lastUpdateTimestamp = endTime;
        } else {
          // If parcel is carried or no longer has an high value, remove it from the list
          this.#parcelList.splice(i);
          i -= 1;
        }

        // Remove the just analyzed parcel from the map so later it is possible to see what are the new parcels
        sensedParcelsMap.delete(currentParcelFromBelief.parcel.id);
      } else {
        currentParcelFromBelief.cumulatedTime +=
          (endTime - currentParcelFromBelief.lastUpdateTimestamp) / 1000;

        const newReward =
          currentParcelFromBelief.cumulatedTime >= this.#parcelDecayTimerValue
            ? currentParcelFromBelief.parcel.reward -
            Math.floor(
              currentParcelFromBelief.cumulatedTime /
              this.#parcelDecayTimerValue,
            )
            : currentParcelFromBelief.parcel.reward;

        if (newReward < this.#parcelMinScore) {
          // If parcel is not present in the current sensed list, it can no longer be sensed: check if it is necessary to delete it
          // (every time it is added the delta between the last check and the latest, when this is bigger than the parcelDecayTimerValue it means
          //  it is necessary to decrease its reward, if under a certain delta (parcelMinScore), delete the parcel)
          this.#parcelList.splice(i);
          i -= 1;
        } else {
          if (
            currentParcelFromBelief.cumulatedTime >= this.#parcelDecayTimerValue
          ) {
            currentParcelFromBelief.parcel.reward = newReward;
            currentParcelFromBelief.cumulatedTime = 0;
          }
          currentParcelFromBelief.lastUpdateTimestamp = endTime;
        }
      }
    }

    for (const [_, parcel] of sensedParcelsMap) {
      if (
        parcel.carriedBy == undefined &&
        parcel.reward >= this.parcelMinScore &&
        this.#tileMap.getGreenTile(new TargetTile(new Coordinates(parcel.x, parcel.y)))
      ) {
        let newParcel = new Parcel(parcel, Date.now());

        this.#parcelList.push(newParcel);
      }
    }
  }


  /**
   * @param {IOTile[]} tiles
   */
  updateTileMap(tiles) {
    // NOTE: tiles is a 1D array where x indicates the column index, while y the row one
    for (let i = 0; i < tiles.length; i++) {
      const coordinates = new Coordinates(tiles[i].x, tiles[i].y);

      const colIdx = tiles[i].x;
      // Create the column in the map if it does not exist
      if (this.tileMap.tiles.length == colIdx) {
        this.tileMap.tiles.push([]);
      }

      const tileType = tiles[i].type;

      // Store the map as a column-wise matrix, so that it matches the standard coordinates
      // Coordinates(x, y) corresponds to tileMap.tiles[x][y]
      this.tileMap.tiles[colIdx].push(tileType);

      if (tileType == "1") {
        // Green tiles (parcel spawn)
        this.tileMap.greenTiles.push(new TargetTile(coordinates));
      } else if (tileType == "2") {
        // Red tiles (delivery)
        this.tileMap.redTiles.push(new TargetTile(coordinates));
      } else if (tileType == "5" || tileType == "5!") {
        this.tileMap.yellowTiles.push(tiles[i]);
      }
    }

    //Prepare map for planner (cycling fixing x and obtaining y)
    const generatedTileMap = this.tileMap.tiles;
    for (let x = 0; x < generatedTileMap.length; x += 1) {
      for (let y = 0; y < generatedTileMap[x].length; y += 1) {
        if (generatedTileMap[x][y] != "0") {
          //Check if tile is on the RIGHT of another tile
          if (
            x != 0 &&
            generatedTileMap[x - 1][y] != "0" &&
            generatedTileMap[x - 1][y] != "→"
          ) {
            this.#plannerBeliefSet.declare(
              `right tile${x}_${y} tile${x - 1}_${y}`,
            );
          }
          //Check if tile is on the LEFT of another tile
          if (
            x != generatedTileMap.length - 1 &&
            generatedTileMap[x + 1][y] != "0" &&
            generatedTileMap[x + 1][y] != "←"
          ) {
            this.#plannerBeliefSet.declare(
              `left tile${x}_${y} tile${x + 1}_${y}`,
            );
          }
          //Check if tile is UNDER another tile
          if (
            y != generatedTileMap[x].length - 1 &&
            generatedTileMap[x][y + 1] != "0" &&
            generatedTileMap[x][y + 1] != "↓"
          ) {
            this.#plannerBeliefSet.declare(
              `under tile${x}_${y} tile${x}_${y + 1}`,
            );
          }
          //Check if tile is OVER another tile
          if (
            y != 0 &&
            generatedTileMap[x][y - 1] != "0" &&
            generatedTileMap[x][y - 1] != "↑"
          ) {
            this.#plannerBeliefSet.declare(
              `over tile${x}_${y} tile${x}_${y - 1}`,
            );
          }
          //Set tile to crateTile if the tile is YELLOW (5 or 5!)
          if (generatedTileMap[x][y] == "5" || generatedTileMap[x][y] == "5!") {
            this.#plannerBeliefSet.declare(`crateTile tile${x}_${y}`);
          }
        }
      }
    }

    // Retrieve paths from greens to reds and vice versa
    this.#pathFinder = new PathFinder(this.tileMap.tiles);
    for (const green of this.tileMap.greenTiles) {
      for (const red of this.tileMap.redTiles) {
        const path = this.#pathFinder.search(
          green.coordinates,
          red.coordinates,
        );
        if (path.length != 0) {
          // Check if the red tile is in a one-way area
          const backPath = this.#pathFinder.search(
            red.coordinates,
            green.coordinates,
          );
          if (backPath.length != 0) {
            green.addPath(red.coordinates, path);
            red.addPath(green.coordinates, backPath);
          }
        }
      }
    }

    this.#updatePathsWeights();
  }

  #updatePathsWeights() {
    // Calculate probability of each path from greens according to the distance
    for (let i = 0; i < this.tileMap.greenTiles.length; i++) {
      const green = this.#tileMap.greenTiles[i];

      // Remove isolated greens
      if (green.pathList.size == 0) {
        this.#tileMap.greenTiles.splice(i, 1);
        continue;
      }

      green.updatePathsWeights();
    }

    // Calculate probability of each path from reds according to the distance
    for (let i = 0; i < this.tileMap.redTiles.length; i++) {
      const red = this.#tileMap.redTiles[i];

      // Remove isolated reds
      if (red.pathList.size == 0) {
        this.#tileMap.redTiles.splice(i, 1);
        continue;
      }

      red.updatePathsWeights();
    }
  }

  /**@param {IOConfig} config*/
  updateGameConfiguration(config) {
    this.#parcelAvgScore = config.GAME.parcels.reward_avg;
    this.#parcelVarScore = config.GAME.parcels.reward_variance;
    this.#parcelMinScore = this.#parcelAvgScore * this.#parcelMinScoreMultiplier;

    this.#parcelDecayTimerValue = Number(
      config.GAME.parcels.decaying_event.toString().split("s")[0],
    );

    this.#gameSpeed = config.GAME.player.movement_duration;

    this.#maxParcelsPresent = config.GAME.parcels.max;
  }

  /**@param {IOAgent[]} agents*/
  updateNearAgentList(agents) {
    //Clear the array
    this.#nearAgentList.splice(0, this.#nearAgentList.length);

    //Copy needed: sometimes coordinates have decimal points
    for (const agent of agents) {

      //Set the global encountered agents map
      this.#encounteredAgentsIdList.set(agent.id, agent);

      //Update nearby agents list
      if (agent.x && agent.y) {
        agent.x = Math.ceil(agent.x);
        agent.y = Math.ceil(agent.y);
      }
      this.#nearAgentList.push(agent);
    }
  }

  /**
   * @param {IOCrate[]} crates
   */
  updateTileWithCrate(crates) {
    //Recreate map
    for (const crate of crates) {
      this.#tileWithCrateMap.set(crate.id, new Coordinates(crate.x, crate.y));
    }
  }

  /**
   * @param {Coordinates} tileCoordinates 
   */
  isTileWithCrate(tileCoordinates) {
    for (const [_, tile] of this.#tileWithCrateMap) {
      if (tileCoordinates.x == tile.x && tileCoordinates.y == tile.y) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {Coordinates} tileCoordinates 
   */
  isTileWithAgent(tileCoordinates) {
    for (const agent of this.#nearAgentList) {
      if (agent.x == tileCoordinates.x && agent.y == tileCoordinates.y) {
        return agent;
      }
    }
  }

  getBeliefForPlanner() {
    //At start, all is set with the corresponding position. notCrate and crate are added here, when map has to be returned. Same for perry position.

    //Creating a copy of current belief for planner
    const plannerBeliefs = new Beliefset();
    for (const b of this.#plannerBeliefSet.entries) {
      plannerBeliefs.declare(b[0]);
    }

    //Convert current crateMap to list and add crate predicates
    const cratePositionList = [];
    for (const [_, c] of this.#tileWithCrateMap) {
      plannerBeliefs.declare(`crate tile${c.x}_${c.y}`);
      cratePositionList.push(c);
    }

    //Add crate and nonCrate states to tiles
    const generatedTileMap = this.tileMap.tiles;
    for (let x = 0; x < generatedTileMap.length; x += 1) {
      for (let y = 0; y < generatedTileMap[x].length; y += 1) {
        let found = false;
        for (let i = 0; i < cratePositionList.length; i += 1) {
          if (cratePositionList[i].x == x && cratePositionList[i].y == y) {
            found = true;
            break;
          }
        }
        if (!found) {
          plannerBeliefs.declare(`notCrate tile${x}_${y}`);
        }
      }
    }

    plannerBeliefs.declare(
      `perry tile${this.#me.coordinates.x}_${this.#me.coordinates.y}`,
    );

    return plannerBeliefs;
  }

  getBeliefsForLLM() {
    const beliefs = `
    input:
      - score: ${this.me.score}
      - penalty: ${this.me.penalty}
      - max number of parcels: ${this.#maxParcelsPresent}
      - average score per parcel: ${this.#parcelAvgScore}
      - variance score of parcels: ${this.#parcelVarScore}
      - number of agents: ${this.getNumberOfEncounteredAgents() + 1}
      - mean of attempts to follow a path: ${this.goToInteractionData.getGoToBlockMean()}
      - random function: ${this.#randomFunctionType}

    current parameters:
      - number of possible deviations: ${this.#numberOfPossibleDeviations}
      - number of ignored tiles after obstacle: ${this.#numberOfIgnoredTilesForAgentPresence}
      - delay per movement: ${this.#me.agentMovementDelay} ms
      - random function: ${this.#randomFunctionType}
      - multiplier for parcelMinScore: ${this.#parcelMinScoreMultiplier}

    additional info:
      ${this.#additionalInfoForLLMTuning}
    `.trim();

    return beliefs;
  }

  getNumberOfEncounteredAgents() {
    return this.#encounteredAgentsIdList.size;
  }
}