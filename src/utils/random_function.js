export class RandomFunction {
  /**
   * @type { string }
   */
  static #type;

  /**
   * @param {string} type 
   */
  static setFunctionType(type) {
    this.#type = type;
  }

  /**
   * @param {number} x 
   */
  static get(x) {
    switch (this.#type) {
      case CosineRandomFunction.TYPE:
        return CosineRandomFunction.get(x);
      case HyperbolaRandomFunction.TYPE:
        return HyperbolaRandomFunction.get(x);
      default:
        return 1;
    }
  }
}

export class CosineRandomFunction {
  static #TYPE = "cosine";
  static #M = 1.5;

  static get TYPE() {
    return this.#TYPE;
  }

  /**
   * @param {number} x 
   */
  static get(x) {
    // cos(x * 1.5) returns a value in (~0.07, 1], slightly better than y=1-x, used for higher randomicity
    return Math.cos(x * this.#M);
  }
}

export class HyperbolaRandomFunction {
  static #TYPE = "hyperbola";
  static #N = 0.1;
  static #D = 0.1;

  static get TYPE() {
    return this.#TYPE;
  }

  /**
   * @param {number} x 
   */
  static get(x) {
    // 0.1/(x+0.1) returns a value in (~0.09, 1], used for a more drastic drop as distance increases
    return this.#N / (x + this.#D);
  }
}
