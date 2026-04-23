// more complex but efficient implementation
// http://github.com/bgrins/javascript-astar

// https://dev.to/codesphere/pathfinding-with-javascript-the-a-algorithm-3jlb
let cols = 5; //columns in the grid
let rows = 5; //rows in the grid

// let grid = new Array(cols); //array of all the grid points
let grid = [];

let openSet = []; //array containing unevaluated grid points
let closedSet = []; //array containing completely evaluated grid points

let start; //starting grid point
let end; // ending grid point (goal)
let path = [];

//heuristic we will be using - Manhattan distance
//for other heuristics visit - https://theory.stanford.edu/~amitp/GameProgramming/Heuristics.html
function heuristic(position0, position1) {
  let d1 = Math.abs(position1.x - position0.x);
  let d2 = Math.abs(position1.y - position0.y);

  return d1 + d2;
}

//constructor function to create all the grid points as objects containind the data for the points
function GridPoint(x, y, w) {
  this.x = x; //x location of the grid point
  this.y = y; //y location of the grid point
  this.w = w; //weight (0=no-walkable, walkable otherwise)
  this.f = 0; //total cost function
  this.g = 0; //cost function from start to the current grid point
  this.h = 0; //heuristic estimated cost function from current grid point to the goal
  this.neighbors = []; // neighbors of the current grid point
  this.parent = undefined; // immediate source of the current grid point

  // update neighbors array for a given grid point
  this.updateNeighbors = function (grid) {
    if (this.w == 0) return;

    let i = this.x;
    let j = this.y;

    // top
    if (i > 0 && grid[i - 1][j].w > 0) {
      this.neighbors.push(grid[i - 1][j]);
    }
    // bottom
    if (i < rows - 1 && grid[i + 1][j].w > 0) {
      this.neighbors.push(grid[i + 1][j]);
    }
    // left
    if (j > 0 && grid[i][j - 1].w > 0) {
      this.neighbors.push(grid[i][j - 1]);
    }
    // right
    if (j < cols - 1 && grid[i][j + 1].w > 0) {
      this.neighbors.push(grid[i][j + 1]);
    }
  };
}

//initializing the grid
function init() {
  // NOTE: map[0][0] is the top left corner
  const map = [
    [0, 0, 0, 1, 1],
    [0, 0, 1, 1, 1],
    [0, 0, 1, 0, 0],
    [1, 1, 1, 1, 0]
  ];

  rows = map.length;
  cols = map[0].length

  for (let i = 0; i < rows; i++) {
    grid.push([]);
    for (let j = 0; j < cols; j++) {
      grid[i].push(new GridPoint(i, j, map[i][j]));
    }
  }

  //making a 2D array
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      grid[i][j].updateNeighbors(grid);
    }
  }

  start = grid[rows - 1][0];  // bottom left corner
  end = grid[0][cols - 1];    // top right corner

  openSet.push(start);

  // console.log(grid);
}

//A star search implementation

function search() {
  init();
  while (openSet.length > 0) {
    //assumption lowest index is the first one to begin with
    let lowestIndex = 0;
    for (let i = 0; i < openSet.length; i++) {
      if (openSet[i].f < openSet[lowestIndex].f) {
        lowestIndex = i;
      }
    }
    let current = openSet[lowestIndex];

    if (current === end) {
      let temp = current;
      path.push(temp);
      while (temp.parent) {
        path.push(temp.parent);
        temp = temp.parent;
      }
      console.log("DONE!");
      // return the traced path
      return path.reverse();
    }

    //remove current from openSet
    openSet.splice(lowestIndex, 1);
    //add current to closedSet
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
        neighbor.h = heuristic(neighbor, end);
        neighbor.f = neighbor.g + neighbor.h;
        neighbor.parent = current;
      }
    }
  }

  //no solution by default
  return [];
}

const res = search();
for (const step of res) {
  console.log("(", step.x, ", ", step.y, ")");
}
