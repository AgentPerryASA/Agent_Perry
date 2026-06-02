/** @typedef IOParcel @type {import("@unitn-asa/deliveroo-js-sdk").IOParcel}} */
/**@typedef IOTile @type {import("@unitn-asa/deliveroo-js-sdk").IOTile} */
/**@typedef IOConfig @type {import("@unitn-asa/deliveroo-js-sdk").IOConfig} */
/**@typedef IOAgent @type {import("@unitn-asa/deliveroo-js-sdk").IOAgent} */
/**@typedef IOCrate @type {import("@unitn-asa/deliveroo-js-sdk/types/IOSensing.js").IOCrate}*/

import { Beliefset } from "@unitn-asa/pddl-client";
import { Coordinates } from "./coordinates.js";
import { MapPoint, PathFinder } from "./path_finder.js";
import { GoToPlan, GoPickUpPlan, GoPutDownPlan, DeviateAndPickUpPlan, DeviateUsingAStarPlan, DeviateUsingPlannerPlan } from "./plan.js";

export class Me {
  /**@type {string} */
  #id;
  /**@type {string} */
  #name;
  /**@type {number} */
  #score;
  /**@type {number} */
  #penalty;
  /**@type {Coordinates} */
  #coordinates;
  /**@type {Parcel[]} */
  #carriedParcelList;
  /**@type {string} */
  #mateId;

  /**
   * @param {string} id
   * @param {string} name
   * @param {number} score
   * @param {number} penalty
   * @param {Coordinates} coordinates
   */
  constructor(id, name, score, penalty, coordinates) {
    this.#id = id;
    this.#name = name;
    this.#score = score;
    this.#penalty = penalty;
    this.#coordinates = coordinates;
    this.#carriedParcelList = [];
    this.#mateId = "";
  }

  get id() {
    return this.#id;
  }

  get name() {
    return this.#name;
  }

  get score() {
    return this.#score;
  }

  get penalty() {
    return this.#penalty;
  }

  get coordinates() {
    return this.#coordinates;
  }

  get carriedParcelList() {
    return this.#carriedParcelList;
  }

  get mateId() {
    return this.#mateId;
  }

  set coordinates(c) {
    this.#coordinates = c;
  }

  set mateId(value) {
    if (!this.#mateId) {
      this.#mateId = value;
    }
  }

  /**
   * 
   * @param {IOAgent} agent 
   */
  updateMe(agent) {
    this.#id = agent.id;
    this.#name = agent.name;
    this.#score = agent.score;
    this.#penalty = agent.penalty;
  }

  /**
   * @param {IOParcel[]} sensedParcelsList
   */
  reviseCarriedParcelList(sensedParcelsList) {
    // Assume that no parcel is dropped after being picked up, therefore, it is not possible to pickup a previously picked up parcel.
    // Notice that onSensing is triggered when the agent has a parcel, even if it is not moving
    const endTime = Date.now() + 0.01 * this.#carriedParcelList.length;

    let sensedParcelsMap = new Map();
    if (sensedParcelsList.length > 0) {
      //Filter only parcels carried by the agent itself
      for (let i = 0; i < sensedParcelsList.length; i += 1) {
        const p = sensedParcelsList[i];
        if (p.carriedBy && p.carriedBy == this.#id) {
          sensedParcelsMap.set(p.id, p);
        }
      }
    }

    for (let i = 0; i < this.#carriedParcelList.length; i += 1) {
      const currentParcelFromBelief = this.#carriedParcelList[i];
      const currentParcelFromSensedList = sensedParcelsMap.get(
        currentParcelFromBelief.parcel.id,
      );
      if (currentParcelFromSensedList != undefined) {
        // If parcel was already present in list, update its information
        currentParcelFromBelief.parcel = currentParcelFromSensedList;
        currentParcelFromBelief.lastUpdateTimestamp = endTime;
        currentParcelFromBelief.cumulatedTime +=
          (endTime - currentParcelFromBelief.lastUpdateTimestamp) / 1000;
        sensedParcelsMap.delete(currentParcelFromBelief.parcel.id);
      } else {
        // If parcel is not present in the sensed list, this means the agent no longer carries it,
        // therefore, it needs to be dropped from the list
        this.#carriedParcelList.splice(i);
        i -= 1;
      }
    }

    // Finally, add the new parcels that were picked up
    for (const [_, parcel] of sensedParcelsMap) {
      let newParcel = new Parcel(parcel, Date.now());
      this.#carriedParcelList.push(newParcel);
    }
  }

}

export class WorldMap {
  /** @type { string[][] } */
  tiles;
  /** @type { TargetTile[] } */
  greenTiles;
  /** @type { TargetTile[] } */
  redTiles;
  /** @type {IOTile[]} */
  yellowTiles;

  /**
   * @param {string[][]} tiles
   * @param {TargetTile[]} greenTiles
   * @param {TargetTile[]} redTiles
   * @param {IOTile[]} yellowTiles
   */
  constructor(tiles, greenTiles, redTiles, yellowTiles) {
    this.tiles = tiles;
    this.greenTiles = greenTiles;
    this.redTiles = redTiles;
    this.yellowTiles = yellowTiles;
  }

  /**
   * @param {TargetTile} targetTile
   */
  getGreenTile(targetTile) {
    for (const green of this.greenTiles) {
      if (green.isEqual(targetTile)) {
        return green;
      }
    }
  }

  /**
   * @param {TargetTile} targetTile
   */
  getRedTile(targetTile) {
    for (const red of this.redTiles) {
      if (red.isEqual(targetTile)) {
        return red;
      }
    }
  }

  /**
   * @param {Coordinates} coordinates
   */
  getYellowTile(coordinates) {
    for (const yellow of this.yellowTiles) {
      if (yellow.x == coordinates.x && yellow.y == coordinates.y) {
        return yellow;
      }
    }
    return undefined;
  }
}

export class Parcel {
  /**@type {number} */
  lastUpdateTimestamp;

  /**@type {number} */
  cumulatedTime;

  /**@type {IOParcel} */
  parcel;

  /**
   * @param {IOParcel} parcel
   * @param {number} lastUpdateTimestamp
   */
  constructor(parcel, lastUpdateTimestamp) {
    this.parcel = parcel;
    this.cumulatedTime = 0;
    this.lastUpdateTimestamp = lastUpdateTimestamp;
  }
}

export class GoToInteractionData {
  /**@type {number}*/
  #globalBlockCounter;

  /**@type {number}*/
  #numberOfStartedGoTo;

  constructor() {
    this.#globalBlockCounter = 0;
    this.#numberOfStartedGoTo = 0;
  }

  incrementBlockCounter() {
    this.#globalBlockCounter += 1;
  }

  incrementNumberOfStartedGoTo() {
    this.#numberOfStartedGoTo += 1;
  }

  getGoToBlockMean() {

    if (this.#numberOfStartedGoTo > 0) {
      return this.#globalBlockCounter / this.#numberOfStartedGoTo;
    }

    return 0;
  }

};

export class LLMUpdatedParameters {
  /**@type {number}*/
  #numberOfPossibleDeviations;

  /**@type {number}*/
  #numberOfCheckedTilesForAgentPresence;

  /**@type {number}*/
  #numberOfIgnoredTilesForAgentPresence;

  /**@type {number} */
  #movementDelay;

  /**@type {string}*/
  #randomFunction;

  /**@type {number}*/
  #minScoreMultiplier;

  /**
   * @param {number} numberOfPossibleDeviations
   * @param {number} numberOfCheckedTilesForAgentPresence 
   * @param {number} numberOfIgnoredTilesForAgentPresence 
   * @param {number} movementDelay 
   * @param {string} randomFunction 
   * @param {number} minScoreMultiplier 
   */
  constructor(numberOfPossibleDeviations, numberOfCheckedTilesForAgentPresence, numberOfIgnoredTilesForAgentPresence, movementDelay, randomFunction, minScoreMultiplier) {
    this.#numberOfPossibleDeviations = numberOfPossibleDeviations;
    this.#numberOfCheckedTilesForAgentPresence = numberOfCheckedTilesForAgentPresence;
    this.#numberOfIgnoredTilesForAgentPresence = numberOfIgnoredTilesForAgentPresence;
    this.#movementDelay = movementDelay;
    this.#randomFunction = randomFunction;
    this.#minScoreMultiplier = minScoreMultiplier;
  }

  get numberOfPossibleDeviations() {
    return this.#numberOfPossibleDeviations;
  }

  get numberOfCheckedTilesForAgentPresence() {
    return this.#numberOfCheckedTilesForAgentPresence;
  }

  get numberOfIgnoredTilesForAgentPresence() {
    return this.#numberOfIgnoredTilesForAgentPresence;
  }

  get movementDelay() {
    return this.#movementDelay;
  }

  get randomFunction() {
    return this.#randomFunction;
  }

  get minScoreMultiplier() {
    return this.#minScoreMultiplier;
  }
}

export class Beliefs {
  /**@type {PathFinder | undefined}*/
  #pathFinder;

  /**@type {Parcel[]} */
  #parcelList;

  /**@type {WorldMap} */
  #tileMap;

  /**@type {number} */
  #carriedParcelsCount;

  /**@type {number} */
  #parcelMinScore;

  /**@type {number} */
  #parcelMaxScore;

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

  /**@type {(typeof GoToPlan | typeof GoPickUpPlan | typeof GoPutDownPlan | typeof DeviateAndPickUpPlan | typeof DeviateUsingAStarPlan | typeof DeviateUsingPlannerPlan)[]}*/
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

  constructor() {
    this.#parcelList = [];
    this.#tileMap = new WorldMap([], [], [], []);
    this.#carriedParcelsCount = 0;
    this.#parcelMinScore = 0;
    this.#parcelMaxScore = 0;
    this.#maxParcelsPresent = 0;
    this.#gameSpeed = 0;
    this.#nearAgentList = [];
    this.#parcelDecayTimerValue = 0;
    this.#deviateAndPickupIntentionCounter = 0;
    this.#pathFinder = undefined;
    this.#me = new Me("", "", 0, 0, new Coordinates(0, 0));
    this.#tileWithCrateMap = new Map();
    this.#plannerBeliefSet = new Beliefset();
    this.#planLibrary = [GoToPlan, GoPickUpPlan, GoPutDownPlan, DeviateAndPickUpPlan, DeviateUsingAStarPlan, DeviateUsingPlannerPlan];
    this.#encounteredAgentsIdList = new Map();
    this.#goToInteractionData = new GoToInteractionData();
    this.#numberOfCheckedTilesForAgentPresence = 4;
    this.#numberOfIgnoredTilesForAgentPresence = 2;
    this.#numberOfPossibleDeviations = 5;
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

  get carriedParcelsCount() {
    return this.#carriedParcelsCount;
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

  set deviateAndPickupIntentionCounter(value) {
    this.#deviateAndPickupIntentionCounter = value;
  }

  set carriedParcelsCount(value) {
    this.#carriedParcelsCount = value;
  }

  set currentTargetTile(tile) {
    this.#currentTargetTile = tile;
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
    this.#numberOfCheckedTilesForAgentPresence = parameters.numberOfCheckedTilesForAgentPresence;

    this.#numberOfIgnoredTilesForAgentPresence = parameters.numberOfIgnoredTilesForAgentPresence;

    this.#numberOfPossibleDeviations = parameters.numberOfPossibleDeviations;
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
        // If the current parcel was in the sensed list, then update value with that.
        // A check to see if it is now carried is necessary, as well as a check to see whether
        // the parcel is still good to be picked up (>= min value).
        if (
          currentParcelFromSensedList.carriedBy == undefined &&
          currentParcelFromSensedList.reward >= this.#parcelMinScore
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
        parcel.reward >= this.parcelMinScore
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
    const avgScore = config.GAME.parcels.reward_avg;
    this.#parcelMinScore = avgScore * 0.4;

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
        return true;
      }
    }

    return false;
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
    Our agent is in the following situation:
      - Score: ${this.me.score}
      - Penalty: ${this.me.penalty}
      - Decay: ${this.parcelDecayTimerValue}
      - Maximum number of parcels that can be simultaneously present: ${this.#maxParcelsPresent}
      - Maximum parcel value: ${this.#parcelMaxScore}
      - Number of agents: ${this.getNumberOfEncounteredAgents()}
      - Mean of blocks during movements: ${this.goToInteractionData.getGoToBlockMean()}
    `.trim();

    return beliefs;
  }

  getNumberOfEncounteredAgents() {
    return this.#encounteredAgentsIdList.size;
  }

}

export class TargetTile {
  #coordinates;
  /** @type {Map<Coordinates, WeightedPath>} */
  #pathList;
  #totalPathsLength;

  /**
   * @param {Coordinates} coordinates
   */
  constructor(coordinates) {
    this.#coordinates = coordinates;
    this.#pathList = new Map();
    this.#totalPathsLength = 0;
  }

  get coordinates() {
    return this.#coordinates;
  }

  get pathList() {
    return this.#pathList;
  }

  /**
   * @param {Coordinates} destinationTile
   * @param {MapPoint[]} path
   */
  addPath(destinationTile, path) {
    this.#totalPathsLength += path.length;
    this.#pathList.set(destinationTile, new WeightedPath(0, path));
  }

  updatePathsWeights() {
    for (const weightedPath of this.#pathList.values()) {
      // If there is only one path available ...
      if (this.#pathList.size == 1) {
        // ... the chance to select it is 100% ...
        weightedPath.weight = 1;
        return;
      }

      // ... otherwise normalize each path length and compute the probability
      const ratio = weightedPath.path.length / this.#totalPathsLength;
      // cos(x * 1.5) returns a value in (~0.07, 1], the long the path, the lower the probability
      // NOTE: cos(x * 1.5) is slightly greater than y = -x + 1, try hyperbola instead
      //       (like y = 0.1 / (x + 0.1)) for a more drastic drop as distance increases
      weightedPath.weight = Math.cos(ratio * 1.5);
    }
  }

  /**
   * @param {TargetTile} targetTile
   */
  isEqual(targetTile) {
    return this.#coordinates.isEqual(targetTile.coordinates);
  }
}

class WeightedPath {
  #weight;
  #path;

  /**
   * @param {number} weight
   * @param {MapPoint[]} path
   */
  constructor(weight, path) {
    this.#weight = weight;
    this.#path = path;
  }

  get weight() {
    return this.#weight;
  }

  get path() {
    return this.#path;
  }

  set weight(value) {
    if (value < 0) {
      value = 0;
    } else if (value > 1) {
      value = 1;
    }

    this.#weight = value;
  }
}
