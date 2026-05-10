/** @typedef IOParcel @type {import("@unitn-asa/deliveroo-js-sdk").IOParcel}} */
/**@typedef IOTile @type {import("@unitn-asa/deliveroo-js-sdk").IOTile} */
/**@typedef IOConfig @type {import("@unitn-asa/deliveroo-js-sdk").IOConfig} */
/**@typedef IOAgent @type {import("@unitn-asa/deliveroo-js-sdk").IOAgent} */
import { Coordinates } from "./coordinates.js";
import { MapPoint, PathFinder } from "./path_finder.js";

export class WorldMap {
  /** @type { string[][] } */
  tiles;
  /** @type { TargetTile[] } */
  greenTiles;
  /** @type { TargetTile[] } */
  redTiles;

  /**
   * @param {string[][]} tiles
   * @param {TargetTile[]} greenTiles
   * @param {TargetTile[]} redTiles
   */
  constructor(tiles, greenTiles, redTiles) {
    this.tiles = tiles;
    this.greenTiles = greenTiles;
    this.redTiles = redTiles;
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

export class Beliefs {
  /**@type {Parcel[]} */
  #parcelList;

  /**@type {WorldMap} */
  #tileMap;

  /**@type {number} */
  #carriedParcelsCount;

  /**@type {number} */
  #parcelMinScore;

  /**@type {IOAgent[]} */
  #nearAgentList;

  constructor() {
    this.#parcelList = [];
    this.#tileMap = new WorldMap([], [], []);
    this.#carriedParcelsCount = 0;
    this.#parcelMinScore = 0;
    this.#nearAgentList = [];
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

  get nearAgentList() {
    return this.#nearAgentList;
  }

  set carriedParcelsCount(n) {
    this.#carriedParcelsCount = n;
  }

  /**
   * @param {Parcel} parcel
   * @returns {boolean}
   */
  #isParcelToBeRemoved(parcel) {
    const newReward = Math.ceil(parcel.parcel.reward - parcel.cumulatedTime);
    if (newReward < this.#parcelMinScore) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * @param {IOParcel[] | undefined} sensedParcelList
   */
  reviseParcelList(sensedParcelList) {
    let endTime = Date.now() + 0.01 * this.#parcelList.length;

    /**@type {Map<string,IOParcel>} */
    let sensedParcelMap = new Map();
    if (sensedParcelList != undefined) {
      sensedParcelMap = new Map(
        sensedParcelList.map((parcel) => [parcel.id, parcel]),
      );
    }

    for (let i = 0; i < this.#parcelList.length; i += 1) {
      let currentParcelFromBelief = this.#parcelList[i]; //parcel from belief
      let currentParcelFromSensedList = sensedParcelMap.get(
        currentParcelFromBelief.parcel.id,
      ); //parcel from sensed list

      if (currentParcelFromSensedList != undefined) {
        // If the current parcel was in the sensed list, then update value with that. A check to see if it is now carried is necessary, as well as a check to see whether the parcel is still good to be picked up (>= min value).
        if (
          currentParcelFromSensedList.carriedBy == undefined &&
          currentParcelFromSensedList.reward >= this.#parcelMinScore
        ) {
          this.#parcelList[i].parcel = currentParcelFromSensedList;
          this.#parcelList[i].lastUpdateTimestamp = endTime;
        } else {
          // If parcel is carried or no longer has an high value, remove it from the list
          this.#parcelList.splice(i);
          i -= 1;
        }

        // Remove the just analyzed parcel from the map so later it is possible to see what are the new parcels
        sensedParcelMap.delete(currentParcelFromBelief.parcel.id);
      } else {
        this.#parcelList[i].cumulatedTime +=
          (endTime - this.#parcelList[i].lastUpdateTimestamp) / 1000;
        if (this.#isParcelToBeRemoved(currentParcelFromBelief)) {
          // If parcel is not present in the current sensed list, it can no longer be sensed: check if it is necessary to delete it
          // (everytime it is added the delta between the last check and the latest, when this is bigger than 1 means one second passed,
          // and we need to decrease the reward)
          this.#parcelList.splice(i);
          i -= 1;
        } else {
          const cumulatedTime = this.#parcelList[i].cumulatedTime;
          const newReward = Math.ceil(
            this.#parcelList[i].parcel.reward - cumulatedTime,
          );
          this.parcelList[i].parcel.reward = newReward;
          if (this.#parcelList[i].cumulatedTime >= 1) {
            this.#parcelList[i].cumulatedTime = 0;
          }
          this.#parcelList[i].lastUpdateTimestamp = endTime;
        }
      }
    }

    for (const [_, parcel] of sensedParcelMap) {
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
      }
    }

    // Retrieve paths from greens to reds and vice versa
    const pathFinder = new PathFinder(this.tileMap.tiles);
    for (const green of this.tileMap.greenTiles) {
      for (const red of this.tileMap.redTiles) {
        const path = pathFinder.search(green.coordinates, red.coordinates);
        if (path.length != 0) {
          // Check if the red tile is in a one-way area
          const backPath = pathFinder.search(red.coordinates, green.coordinates);
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

      green.updatePathsWeight();
    }

    // Calculate probability of each path from reds according to the distance
    for (let i = 0; i < this.tileMap.redTiles.length; i++) {
      const red = this.#tileMap.redTiles[i];

      // Remove isolated reds
      if (red.pathList.size == 0) {
        this.#tileMap.redTiles.splice(i, 1);
        continue;
      }

      red.updatePathsWeight();
    }
  }

  /**
   * @param {{x:number, y:number}} param0
   */
  removeTile({ x: x, y: y }) {
    console.log("Attempt to remove no needed");

    // this.#tileMap.tiles[x][y] = "0";

    // let index = this.#tileMap.green.findIndex((c) =>
    //   c.isEqual(new Coordinates(x, y)),
    // );
    // if (index != -1) {
    //   this.#tileMap.green.splice(index, 1);
    // }

    // index = this.#tileMap.red.findIndex((c) =>
    //   c.isEqual(new Coordinates(x, y)),
    // );
    // if (index != -1) {
    //   this.#tileMap.red.splice(index, 1);
    // }
  }

  /**@param {IOConfig} config*/
  updateGameConfiguration(config) {
    const avgScore = config.GAME.parcels.reward_avg;
    // TODO: TEO
    this.#parcelMinScore = avgScore * 0.1;
  }

  /**@param {IOAgent[]} agents*/
  updateNearAgentList(agents) {
    //Clear the array
    this.#nearAgentList.splice(0, this.#nearAgentList.length);

    //Copy needed, otherwise it's not a copy but a reference
    for (let i = 0; i < agents.length; i += 1) {
      this.#nearAgentList.push(agents[i]);
    }
  }
}

class TargetTile {
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

  updatePathsWeight() {
    for (const weightedPath of this.#pathList.values()) {
      // If there is only one path available ...
      if (this.#pathList.size == 1) {
        // ... the chance to select it is 100% ...
        weightedPath.weight = 1;
        return;
      }

      // ... otherwise normalize each path length and compute the probability
      const ratio = weightedPath.path.length / this.#totalPathsLength;
      // cos(x * 1.5) returns a value in [~0.07, 1], the long the path, the lower the probability
      // NOTE: cos(x * 1.5) is slightly greater than y = -x + 1, try hyperbola instead
      //       (like y = 0.1 / (x + 0.1)) for a more drastic drop as distance increases
      weightedPath.weight = Math.cos(ratio * 1.5)
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
