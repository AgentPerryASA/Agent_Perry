export class Message {
  content;
  handshake;

  /**
   * @param {string} content
   * @param {boolean} handshake
   */
  constructor(content, handshake = false) {
    this.content = content;
    this.handshake = handshake;
  }
}