/** @typedef IOParcel @type {import("@unitn-asa/deliveroo-js-sdk").IOParcel}} */
/**@typedef IOTile @type {import("@unitn-asa/deliveroo-js-sdk").IOTile} */
/**@typedef IOConfig @type {import("@unitn-asa/deliveroo-js-sdk").IOConfig} */
/**@typedef IOAgent @type {import("@unitn-asa/deliveroo-js-sdk").IOAgent} */
import { Coordinates } from "./coordinates.js";

export class Me {
  #id;
  #name;
  #score;
  coordinates;

  /**
   * @param {string} id
   * @param {string} name
   * @param {number} score
   * @param {Coordinates} coordinates
   */
  constructor(id, name, score, coordinates) {
    this.#id = id;
    this.#name = name;
    this.#score = score;
    this.coordinates = coordinates;
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
}

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

  /**@type {Parcel[]} */
  #carriedParcelList;

  /**@type {WorldMap} */
  #tileMap;

  /**@type {number} */
  #carriedParcelsCount;

  /**@type {number} */
  #parcelMinScore;

  /**@type {IOAgent[]} */
  #nearAgentList;

  /**@type {number}*/
  #mapTimerValue;

  /**@type {Me}*/
  #me;

  constructor() {
    this.#parcelList = [];
    this.#carriedParcelList = [];
    this.#tileMap = new WorldMap([], [], []);
    this.#carriedParcelsCount = 0;
    this.#parcelMinScore = 0;
    this.#nearAgentList = [];
    this.#mapTimerValue = 0;
    this.#me = new Me("", "", 0, new Coordinates(0, 0));
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

  get carriedParcelList() {
    return this.#carriedParcelList;
  }

  get parcelMinScore() {
    return this.#parcelMinScore;
  }

  get nearAgentList() {
    return this.#nearAgentList;
  }

  get me() {
    return this.#me;
  }

  set carriedParcelsCount(n) {
    this.#carriedParcelsCount = n;
  }

  clearCarriedParcelList() {
    //Force clearing of carried parcels. In general, this is automatically performed by the revision process though
    this.#carriedParcelList = [];
  }

  /**
   * @param {IOAgent} agent
   */
  updateMe(agent) {
    //No, nothing to do with despicable me
    //Skip intermediate values (0.6 or 0.4)
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
          new Coordinates(agent.x, agent.y),
        );
      }
    }
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
      const currentParcelFromBelief = this.#parcelList[i]; //parcel from belief
      const currentParcelFromSensedList = sensedParcelsMap.get(
        currentParcelFromBelief.parcel.id,
      ); //parcel from sensed list

      if (currentParcelFromSensedList != undefined) {
        // If the current parcel was in the sensed list, then update value with that. A check to see if it is now carried is necessary, as well as a check to see whether the parcel is still good to be picked up (>= min value).
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
          currentParcelFromBelief.cumulatedTime >= this.#mapTimerValue
            ? currentParcelFromBelief.parcel.reward -
              Math.floor(
                currentParcelFromBelief.cumulatedTime / this.#mapTimerValue,
              )
            : currentParcelFromBelief.parcel.reward;

        if (newReward < this.#parcelMinScore) {
          // If parcel is not present in the current sensed list, it can no longer be sensed: check if it is necessary to delete it
          // (every time it is added the delta between the last check and the latest, when this is bigger than the mapTimerValue it means
          //  it is necessary to decrease its reward, if under a certain delta (parcelMinScore), delete the parcel)
          this.#parcelList.splice(i);
          i -= 1;
        } else {
          if (currentParcelFromBelief.cumulatedTime >= this.#mapTimerValue) {
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
   * @param {IOParcel[]} sensedParcelsList
   */
  reviseCarriedParcelList(sensedParcelsList) {
    //Assume that no parcel is dropped after being picked up, therefore, it is not possible to pickup a previously picked up parcel.
    //Notice that onSensing is triggered when the agent has a parcel, even if it is not moving
    const endTime = Date.now() + 0.01 * this.#carriedParcelList.length;

    let sensedParcelsMap = new Map();
    if (sensedParcelsList.length > 0) {
      //Filter only parcels carried by the agent itself
      for (let i = 0; i < sensedParcelsList.length; i += 1) {
        const p = sensedParcelsList[i];
        if (p.carriedBy && p.carriedBy == this.#me.id) {
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
        //If parcel was already present in list, update its information
        currentParcelFromBelief.parcel = currentParcelFromSensedList;
        currentParcelFromBelief.lastUpdateTimestamp = endTime;
        currentParcelFromBelief.cumulatedTime +=
          (endTime - currentParcelFromBelief.lastUpdateTimestamp) / 1000;
        sensedParcelsMap.delete(currentParcelFromBelief.parcel.id);
      } else {
        //If parcel is not present in the sensed list, this means the agent no longer carries it, therefore, it needs to be dropped from the list
        this.#carriedParcelList.splice(i);
        i -= 1;
      }
    }

    //Finally, add the new parcels that were picked up
    for (const [_, parcel] of sensedParcelsMap) {
      let newParcel = new Parcel(parcel, Date.now());
      this.#carriedParcelList.push(newParcel);
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
        this.tileMap.green.push(coordinates);
      } else if (tileType == "2") {
        // Red tiles (delivery)
        this.tileMap.red.push(coordinates);
      }
    }
  }

  /**
   * @param {{x:number, y:number}} param0
   */
  removeTile({ x: x, y: y }) {
    this.#tileMap.tiles[x][y] = "0";

    let index = this.#tileMap.green.findIndex((c) =>
      c.isEqual(new Coordinates(x, y)),
    );
    if (index != -1) {
      this.#tileMap.green.splice(index, 1);
    }

    index = this.#tileMap.red.findIndex((c) =>
      c.isEqual(new Coordinates(x, y)),
    );
    if (index != -1) {
      this.#tileMap.red.splice(index, 1);
    }
  }

  /**@param {IOConfig} config*/
  updateGameConfiguration(config) {
    const avgScore = config.GAME.parcels.reward_avg;
    this.#parcelMinScore = avgScore * 0.1;
    this.#mapTimerValue = Number(
      config.GAME.parcels.decaying_event.toString().split("s")[0],
    );
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
