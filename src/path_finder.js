export class PathFinder {
  #algorithm;

  /**
   * @param {string[][]} map A column-wise matrix, so map[x][y] returns cell (x, y)
   */
  constructor(map) {
    this.#algorithm = new Astar(map);
  }

  /**
   * @param {{x:number, y:number}} start
   * @param {{x:number, y:number}} end
   * @param {MapPoint | undefined} pointToIgnore
   */
  search(start, end, pointToIgnore = undefined) {
    return this.#algorithm.search(start, end, pointToIgnore);
  }

  /**
   * @param {MapPoint} point
   */
  removePoint(point) {
    this.#algorithm.removePoint(point);
  }
}

class Astar {
  /** @type { MapPoint[][] } */
  #map;

  /**
   * @param {string[][]} map A column-wise matrix, so map[x][y] returns cell (x, y)
   */
  constructor(map) {
    const cols = map.length;
    const rows = map[0].length;

    this.#map = [];
    for (let i = 0; i < cols; i++) {
      this.#map.push([]);
      for (let j = 0; j < rows; j++) {
        this.#map[i].push(new MapPoint({ x: i, y: j, w: map[i][j] }));
      }
    }

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        this.#map[i][j].updateNeighbors(this.#map);
      }
    }
  }

  /**
   * @param {MapPoint} point
   */
  removePoint(point) {
    this.#ignorePoint(point, false);
  }

  /**
   * @param {{x:number, y:number}} startPoint
   * @param {{x:number, y:number}} endPoint
   * @param {MapPoint | undefined} pointToIgnore
   * @returns The shortest path from startPoint to endPoint in Manhattan distance
   */
  search(startPoint, endPoint, pointToIgnore = undefined) {
    // Clean points info (parent and functions) before a new run
    this.#cleanForNewSearch(pointToIgnore);

    const start = this.#map[startPoint.x][startPoint.y];
    const end = this.#map[endPoint.x][endPoint.y];
    const openSet = [start];
    const closedSet = [];
    const path = [];

    while (openSet.length > 0) {
      // Assume that the lowest index is the first one to begin with
      let lowestIndex = 0;
      for (let i = 0; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIndex].f) {
          lowestIndex = i;
        }
      }
      let current = openSet[lowestIndex];

      if (current == end) {
        let temp = current;
        path.push(temp);
        while (temp.parent) {
          path.push(temp.parent);
          temp = temp.parent;
        }

        // Return the traced path
        return path.reverse();
      }

      // Remove current point from openSet
      openSet.splice(lowestIndex, 1);
      // Add current to closedSet
      closedSet.push(current);

      let neighbors = current.neighbors;

      for (let i = 0; i < neighbors.length; i++) {
        let neighbor = neighbors[i];

        if (!closedSet.includes(neighbor)) {
          let possibleG = current.g + 1;

          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor);
          } else if (possibleG >= neighbor.g) {
            continue;
          }

          neighbor.g = possibleG;
          neighbor.h = this.#heuristic(neighbor, end);
          neighbor.f = neighbor.g + neighbor.h;
          neighbor.parent = current;
        }
      }
    }

    return [];
  }

  /**
   * @param {MapPoint | undefined} pointToIgnore
   */
  #cleanForNewSearch(pointToIgnore = undefined) {
    // Clean points info (parent and functions)
    const cols = this.#map.length;
    const rows = this.#map[0].length;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        this.#map[i][j].clean();
      }
    }

    if (pointToIgnore) {
      this.#ignorePoint(pointToIgnore, true);
    }
  }

  /**
   * @param {MapPoint} point
   * @param {boolean} resetAfterTimeout
   */
  #ignorePoint(point, resetAfterTimeout) {
    // Update the neighbors of the point so that they ignore it, namely do not put the point as thier neighbor
    for (const neighbor of point.neighbors) {
      neighbor.updateNeighbors(this.#map, point);
    }

    if (resetAfterTimeout) {
      // Reset the neighbors after a while, so that the point is walkable again
      setTimeout(() => {
        for (const neighbor of point.neighbors) {
          neighbor.updateNeighbors(this.#map);
        }
      }, 5000);
    }
  }

  /**
   * @param {MapPoint} p1
   * @param {MapPoint} p2
   * @returns The Manhattan distance between the two given points
   */
  #heuristic(p1, p2) {
    let d1 = Math.abs(p2.x - p1.x);
    let d2 = Math.abs(p2.y - p1.y);

    return d1 + d2;
  }
}

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

  /**
   *
   * @param {{x:number, y:number, w:string}} point
   */
  constructor(point) {
    this.#x = point.x;
    this.#y = point.y;
    this.#w = point.w;
    this.f = 0;
    this.g = 0;
    this.h = 0;
    this.#neighbors = [];
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
   * @param {MapPoint[][]} map
   * @param {MapPoint | undefined} pointToIgnore
   */
  updateNeighbors(map, pointToIgnore = undefined) {
    this.#neighbors = [];

    if (this.#w == "0") return;

    let i = this.#x;
    let j = this.#y;

    // Above
    if (
      j < map[0].length - 1 && // A tile above exists
      !map[i][j + 1].isEqual(pointToIgnore) && // The tile above does not have to be ignored
      map[i][j + 1].w != "0" && // The tile above is walkable
      map[i][j + 1].w != "↓" && // The tile above allows to move up
      this.#w != "↓" // This tile allows to move up
    ) {
      this.#neighbors.push(map[i][j + 1]);
    }

    // Below
    if (
      j > 0 && // A tile below exists
      !map[i][j - 1].isEqual(pointToIgnore) && // The tile below does not have to be ignored
      map[i][j - 1].w != "0" && // The tile below si walkable
      map[i][j - 1].w != "↑" && // The tile below allows to move down
      this.#w != "↑" // This tile allows to move down
    ) {
      this.#neighbors.push(map[i][j - 1]);
    }

    // Right
    if (
      i < map.length - 1 && // A tile on the right exists
      !map[i + 1][j].isEqual(pointToIgnore) && // The tile on the right does not have to be ignored
      map[i + 1][j].w != "0" && // The tile on the right is walkable
      map[i + 1][j].w != "←" && // The tile on the right allows to move right
      this.#w != "←" // This tile allows to move right
    ) {
      this.#neighbors.push(map[i + 1][j]);
    }

    // Left
    if (
      i > 0 && // A tile on the left exists
      !map[i - 1][j].isEqual(pointToIgnore) && // The tile on the left does not have to be ignored
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

  /**
   * @param {MapPoint | undefined} point
   * @returns Whether the given point has the same coordinates as this (false if point is undefined)
   */
  isEqual(point) {
    return point && this.#x == point.x && this.#y == point.y;
  }
}
