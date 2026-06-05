import { Coordinates } from "./coordinates.js";
import { RandomFunction } from "./random_function.js";

export class MapPoint {
  #x; // x location of the map point
  #y; // y location of the map point
  #w; // weight ('0'=no-walkable, arrow=neighbors restriction, walkable otherwise)
  f; // total cost function
  g; // cost function from start to the current map point
  h; // heuristic estimated cost function from current map point to the goal
  /** @type { MapPoint[] } */
  #neighbors; // neighbors of the current map point
  /** @type { MapPoint | undefined } */
  parent; // immediate source of the current map point
  /**@type {Boolean} */
  insertedByPlanner;

  /**
   *
   * @param {{x:number, y:number, w:string}} point
   * @param {Boolean} insertedByPlanner
   */
  constructor(point, insertedByPlanner = false) {
    this.#x = point.x;
    this.#y = point.y;
    this.#w = point.w;
    this.f = 0;
    this.g = 0;
    this.h = 0;
    this.#neighbors = [];
    this.insertedByPlanner = insertedByPlanner;
  }

  get x() {
    return this.#x;
  }

  get y() {
    return this.#y;
  }

  get w() {
    return this.#w;
  }

  get neighbors() {
    return this.#neighbors;
  }

  /**
   * @param {MapPoint} point
   * @param {MapPoint[] | undefined} pointsList 
   */
  #isPointInList(point, pointsList) {
    if (pointsList == undefined || pointsList.length == 0) {
      return false;
    }

    for (const p of pointsList) {
      if (point.isEqual(p)) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {MapPoint[][]} map
   * @param {MapPoint[] | undefined} pointsToIgnoreList
   */
  updateNeighbors(map, pointsToIgnoreList = undefined) {
    this.#neighbors = [];

    if (this.#w == "0") return;

    let i = this.#x;
    let j = this.#y;

    // Above
    if (
      j < map[0].length - 1 && // A tile above exists
      !this.#isPointInList(map[i][j + 1], pointsToIgnoreList) && // The tile above does not have to be ignored
      map[i][j + 1].w != "0" && // The tile above is walkable
      map[i][j + 1].w != "↓" && // The tile above allows to move up
      this.#w != "↓" // This tile allows to move up
    ) {
      this.#neighbors.push(map[i][j + 1]);
    }

    // Below
    if (
      j > 0 && // A tile below exists
      !this.#isPointInList(map[i][j - 1], pointsToIgnoreList) && // The tile below does not have to be ignored
      map[i][j - 1].w != "0" && // The tile below si walkable
      map[i][j - 1].w != "↑" && // The tile below allows to move down
      this.#w != "↑" // This tile allows to move down
    ) {
      this.#neighbors.push(map[i][j - 1]);
    }

    // Right
    if (
      i < map.length - 1 && // A tile on the right exists
      !this.#isPointInList(map[i + 1][j], pointsToIgnoreList) && // The tile on the right does not have to be ignored
      map[i + 1][j].w != "0" && // The tile on the right is walkable
      map[i + 1][j].w != "←" && // The tile on the right allows to move right
      this.#w != "←" // This tile allows to move right
    ) {
      this.#neighbors.push(map[i + 1][j]);
    }

    // Left
    if (
      i > 0 && // A tile on the left exists
      !this.#isPointInList(map[i - 1][j], pointsToIgnoreList) && // The tile on the left does not have to be ignored
      map[i - 1][j].w != "0" && // The tile on the left is walkable
      map[i - 1][j].w != "→" && // The tile on the left allows to move left
      this.#w != "→" // This tile allows to move left
    ) {
      this.#neighbors.push(map[i - 1][j]);
    }
  }

  clean() {
    this.f = 0;
    this.g = 0;
    this.h = 0;
    this.parent = undefined;
  }

  toString() {
    return `${this.x}, ${this.y}`;
  }

  /**
   * @param {MapPoint | undefined} point
   * @returns Whether the given point has the same coordinates as this (false if point is undefined)
   */
  isEqual(point) {
    return point && this.#x == point.x && this.#y == point.y;
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
      weightedPath.weight = RandomFunction.get(ratio);
    }
  }

  /**
   * @param {TargetTile} targetTile
   */
  isEqual(targetTile) {
    return this.#coordinates.isEqual(targetTile.coordinates);
  }
}