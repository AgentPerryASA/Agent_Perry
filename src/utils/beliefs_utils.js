/** @typedef IOParcel @type {import("@unitn-asa/deliveroo-js-sdk").IOParcel}} */
/**@typedef IOTile @type {import("@unitn-asa/deliveroo-js-sdk").IOTile} */



import { Coordinates } from "./coordinates.js";
import { TargetTile } from "./path_utils.js";

export class LLMUpdatedParameters {
    //All public due to serialization necessity
    /**@type {number}*/
    numberOfPossibleDeviations;

    /**@type {number}*/
    numberOfCheckedTilesForAgentPresence;

    /**@type {number}*/
    numberOfIgnoredTilesForAgentPresence;

    /**@type {number} */
    movementDelay;

    /**@type {string}*/
    randomFunction;

    /**@type {number}*/
    minScoreMultiplier;

    /**
     * @param {number} numberOfPossibleDeviations
     * @param {number} numberOfCheckedTilesForAgentPresence 
     * @param {number} numberOfIgnoredTilesForAgentPresence 
     * @param {number} movementDelay 
     * @param {string} randomFunction 
     * @param {number} minScoreMultiplier 
     */
    constructor(numberOfPossibleDeviations, numberOfCheckedTilesForAgentPresence, numberOfIgnoredTilesForAgentPresence, movementDelay, randomFunction, minScoreMultiplier) {
        this.numberOfPossibleDeviations = numberOfPossibleDeviations;
        this.numberOfCheckedTilesForAgentPresence = numberOfCheckedTilesForAgentPresence;
        this.numberOfIgnoredTilesForAgentPresence = numberOfIgnoredTilesForAgentPresence;
        this.movementDelay = movementDelay;
        this.randomFunction = randomFunction;
        this.minScoreMultiplier = minScoreMultiplier;
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