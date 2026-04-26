/** @typedef IOParcel @type {import("@unitn-asa/deliveroo-js-sdk").IOParcel}} */
/**@typedef IOTile @type {import("@unitn-asa/deliveroo-js-sdk").IOTile} */
import { Coordinates } from "./coordinates.js";

export class WorldMap {
  /** @type { string[][] } */
  tiles;
  /** @type { Coordinates[] } */
  green;
  /** @type { Coordinates[] } */
  red;

  /**
   * @param {string[][]} tiles
   * @param {Coordinates[]} green
   * @param {Coordinates[]} red
   */
  constructor(tiles, green, red) {
    this.tiles = tiles;
    this.green = green;
    this.red = red;
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
  tileMap;

  constructor() {
    this.#parcelList = [];
    this.tileMap = new WorldMap([], [], []);
  }

  /**
   * @param {Parcel} parcel
   * @returns {boolean}
   */
  #isParcelToBeRemoved(parcel) {
    const newReward = Math.ceil(parcel.parcel.reward - parcel.cumulatedTime);
    if (newReward <= 0) {
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
      let currentParcelFromBelief = this.#parcelList[i];
      let currentParcelFromSensedList = sensedParcelMap.get(
        currentParcelFromBelief.parcel.id,
      );

      if (currentParcelFromSensedList != undefined) {
        // If the current parcel was in the sensed list, then update value with that. A check to see if it is now carried is necessary.
        if (currentParcelFromSensedList.carriedBy == undefined) {
          this.#parcelList[i].parcel = currentParcelFromSensedList;
          this.#parcelList[i].lastUpdateTimestamp = endTime;
        } else {
          // If parcel is carried, remove it from the list
          this.#parcelList.splice(i);
          i -= 1;
        }

        // Remove the just analyzed parcel from the map so later it is possible to see what are the new parcels
        sensedParcelMap.delete(currentParcelFromBelief.parcel.id);
      } else {
        this.#parcelList[i].cumulatedTime += (endTime - this.#parcelList[i].lastUpdateTimestamp) / 1000;
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
      if (parcel.carriedBy == undefined) {
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

      if (tileType == '1') {
        // Green tiles (parcel spawn)
        this.tileMap.green.push(coordinates);
      } else if (tileType == '2') {
        // Red tiles (delivery)
        this.tileMap.red.push(coordinates);
      }
    }
  }

  get parcelList() {
    return this.#parcelList;
  }
}
