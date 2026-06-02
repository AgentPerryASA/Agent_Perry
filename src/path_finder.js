import { Beliefset, onlineSolver, PddlProblem } from "@unitn-asa/pddl-client";
import path from "path";
import fs from "fs";
import { MapPoint } from "./utils/path_utils.js";

/**
 * @param {string} filePath
 */
async function readFile(filePath) {
  const file = await new Promise((res, rej) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) rej(err);
      else res(data);
    });
  });

  return file ? file : "";
}

export class PathFinder {
  #algorithm;

  /**@type {String | undefined}*/
  #pddlDomainString;

  /**
   * @param {string[][]} map A column-wise matrix, so map[x][y] returns cell (x, y)
   */
  constructor(map) {
    this.#algorithm = new Astar(map);
    this.#pddlDomainString = undefined;
  }

  /**
   * @param {{x:number, y:number}} start
   * @param {{x:number, y:number}} end
   * @param {MapPoint[] | undefined} pointToIgnore
   */
  search(start, end, pointToIgnore = undefined) {
    return this.#algorithm.search(start, end, pointToIgnore);
  }

  /**
   * @param {Beliefset} beliefSet
   * @param {MapPoint} end
   */
  async searchWithPlanner(beliefSet, end) {
    //Get belief already prepared for the planner
    const bs = beliefSet;

    //Build the pddl problem and convert it to string
    const pddlProblem = new PddlProblem(
      `Travel to tile${end.x}_${end.y}`,
      bs.objects.join(" "),
      bs.toPddlString(),
      `perry tile${end.x}_${end.y}`,
    );
    const problemString = pddlProblem.toPddlString();

    if (!this.#pddlDomainString) {
      //Recover domain file
      const filename = path.resolve(process.argv[1]);
      const dirname = path.dirname(filename);
      const filePath = path.join(dirname, "./src/planner/domain.pddl");
      this.#pddlDomainString = await readFile(filePath);
    }

    const plannerPlan = await onlineSolver(
      //@ts-ignore: cannot be undefined because check is performed just before this instruction. At worst is empty.
      this.#pddlDomainString,
      problemString,
    );

    return plannerPlan;
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
    this.#ignorePoint(point, undefined, false);
  }

  /**
   * @param {{x:number, y:number}} startPoint
   * @param {{x:number, y:number}} endPoint
   * @param {MapPoint[] | undefined} pointsToIgnoreList
   * @returns The shortest path from startPoint to endPoint in Manhattan distance
   */
  search(startPoint, endPoint, pointsToIgnoreList = undefined) {
    // Clean points info (parent and functions) before a new run
    this.#cleanForNewSearch(pointsToIgnoreList);

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
   * @param {MapPoint[] | undefined} pointsToIgnoreList
   */
  #cleanForNewSearch(pointsToIgnoreList = undefined) {
    // Clean points info (parent and functions)
    const cols = this.#map.length;
    const rows = this.#map[0].length;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        this.#map[i][j].clean();
      }
    }

    if (pointsToIgnoreList) {
      for (const point of pointsToIgnoreList) {
        this.#ignorePoint(point, pointsToIgnoreList, true);
      }
    }
  }

  /**
   * @param {MapPoint} point
   * @param {MapPoint[] | undefined} pointsToIgnoreList
   * @param {boolean} resetAfterTimeout
   */
  #ignorePoint(point, pointsToIgnoreList, resetAfterTimeout) {
    // Update the neighbors of the point so that they ignore it, namely do not put the point as their neighbor
    for (const neighbor of point.neighbors) {
      neighbor.updateNeighbors(this.#map, pointsToIgnoreList);
    }

    if (resetAfterTimeout) {
      // Reset the neighbors after a while, so that the point is walkable again
      setTimeout(() => {
        for (const neighbor of point.neighbors) {
          neighbor.updateNeighbors(this.#map);
        }
      }, 300);
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
