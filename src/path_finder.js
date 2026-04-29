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
   */
  search(start, end) {
    return this.#algorithm.search(start, end);
  }
}

class Astar {
  /** @type { MapPoint[][] } */
  #map;

  /**
   * @param {string[][]} map A column-wise matrix, so map[x][y] returns cell (x, y)
   */
  constructor(map) {
    const cols = map.length
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
   * @param {MapPoint} p1 
   * @param {MapPoint} p2 
   * @returns The Manhattan distance between the two given points
   */
  #heuristic(p1, p2) {
    let d1 = Math.abs(p2.x - p1.x);
    let d2 = Math.abs(p2.y - p1.y);

    return d1 + d2;
  }

  /**
   * @param {{x:number, y:number}} startPoint
   * @param {{x:number, y:number}} endPoint
   * @returns The shortest path from startPoint to endPoint in Manhattan distance
   */
  search(startPoint, endPoint) {
    // Clean points info (parent and functions) before a new run
    const cols = this.#map.length
    const rows = this.#map[0].length;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        this.#map[i][j].clean();
      }
    }

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
  }
}

export class MapPoint {
  #x;         // x location of the map point
  #y;         // y location of the map point
  #w;         // weight ('0'=no-walkable, arrow=neighbors restriction, walkable otherwise)
  f;          // total cost function
  g;          // cost function from start to the current map point
  h;          // heuristic estimated cost function from current map point to the goal
  /** @type { MapPoint[] } */
  #neighbors; // neighbors of the current map point
  /** @type { MapPoint | undefined } */
  parent;     // immediate source of the current map point

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
   */
  updateNeighbors(map) {
    if (this.#w == '0') return;

    let i = this.#x;
    let j = this.#y;

    // above
    if (
      j < map[0].length - 1 &&    // A tile above exists
      map[i][j + 1].w != '0' &&   // The tile above is walkable
      map[i][j + 1].w != '↓' &&   // The tile above allows to move up
      this.#w != '↓'              // This tile allows to move up
    ) {
      this.#neighbors.push(map[i][j + 1]);
    }

    // below
    if (
      j > 0 &&                    // A tile below exists
      map[i][j - 1].w != '0' &&   // The tile below si walkable
      map[i][j - 1].w != '↑' &&   // The tile below allows to move down
      this.#w != '↑'              // This tile allows to move down
    ) {
      this.#neighbors.push(map[i][j - 1]);
    }

    // right
    if (
      i < map.length - 1 &&       // A tile on the right exists
      map[i + 1][j].w != '0' &&   // The tile on the right is walkable
      map[i + 1][j].w != '←' &&   // The tile on the right allows to move right
      this.#w != '←'              // This tile allows to move right
    ) {
      this.#neighbors.push(map[i + 1][j]);
    }

    // left
    if (
      i > 0 &&                    // A tile on the left exists
      map[i - 1][j].w != '0' &&   // The tile on the left is walkable
      map[i - 1][j].w != '→' &&   // The tile on the left allows to move left
      this.#w != '→'              // This tile allows to move left
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
}