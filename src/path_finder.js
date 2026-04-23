export class PathFinder {
  #algorithm;

  /**
   * @param {number[][]} map
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
  /** @type { MapPoint[] } */
  #openSet;
  /** @type { MapPoint[] } */
  #closedSet;

  /**
   * @param {number[][]} map
   */
  constructor(map) {
    const rows = map.length;
    const cols = map[0].length

    this.#map = [];
    for (let i = 0; i < rows; i++) {
      this.#map.push([]);
      for (let j = 0; j < cols; j++) {
        this.#map[i].push(new MapPoint({ x: i, y: j, w: map[i][j] }));
      }
    }

    this.#openSet = [];
    this.#closedSet = [];
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
    const rows = this.#map.length;
    const cols = this.#map[0].length

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        this.#map[i][j].updateNeighbors(this.#map);
      }
    }

    const start = this.#map[startPoint.x][startPoint.y];
    const end = this.#map[endPoint.x][endPoint.y];
    const path = [];

    this.#openSet.push(start);

    while (this.#openSet.length > 0) {
      // Assume that the lowest index is the first one to begin with
      let lowestIndex = 0;
      for (let i = 0; i < this.#openSet.length; i++) {
        if (this.#openSet[i].f < this.#openSet[lowestIndex].f) {
          lowestIndex = i;
        }
      }
      let current = this.#openSet[lowestIndex];

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
      this.#openSet.splice(lowestIndex, 1);
      // Add current to closedSet
      this.#closedSet.push(current);

      let neighbors = current.neighbors;

      for (let i = 0; i < neighbors.length; i++) {
        let neighbor = neighbors[i];

        if (!this.#closedSet.includes(neighbor)) {
          let possibleG = current.g + 1;

          if (!this.#openSet.includes(neighbor)) {
            this.#openSet.push(neighbor);
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

class MapPoint {
  #x;         // x location of the map point
  #y;         // y location of the map point
  #w;         // weight (0=no-walkable, walkable otherwise)
  f;          // total cost function
  g;          // cost function from start to the current map point
  h;          // heuristic estimated cost function from current map point to the goal
  /** @type { MapPoint[] } */
  #neighbors; // neighbors of the current map point
  /** @type { MapPoint | undefined } */
  parent;    // immediate source of the current map point

  /**
   * 
   * @param {{x:number, y:number, w:number}} point
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
    if (this.#w == 0) return;

    let i = this.#x;
    let j = this.#y;

    // top
    if (i > 0 && map[i - 1][j].w > 0) {
      this.#neighbors.push(map[i - 1][j]);
    }
    // bottom
    if (i < map.length - 1 && map[i + 1][j].w > 0) {
      this.#neighbors.push(map[i + 1][j]);
    }
    // left
    if (j > 0 && map[i][j - 1].w > 0) {
      this.#neighbors.push(map[i][j - 1]);
    }
    // right
    if (j < map[0].length - 1 && map[i][j + 1].w > 0) {
      this.#neighbors.push(map[i][j + 1]);
    }
  }
}