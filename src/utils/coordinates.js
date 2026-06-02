export class Coordinates {
  x;
  y;

  /**
   * @param {number}  x
   * @param {number}  y
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  toString() {
    return `${this.x}, ${this.y}`;
  }

  /**
   * @param {Coordinates} coordinates
   */
  isEqual(coordinates) {
    return this.x == coordinates.x && this.y == coordinates.y;
  }
}
