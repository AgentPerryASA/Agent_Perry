/** @typedef Message @type { HandshakeMessage | ActionMessage | BDIRespondeMessage } */

export const MessageType = {
  HandshakeMessage: "handshake",
  ActionMessage: "action",
  BDIRespondeMessage: "bdiresponse"
}

export class HandshakeMessage {
  type;
  content;
  handshake;

  /**
   * @param {{content: string, handshake: boolean}} message
   */
  constructor({ content, handshake = false }) {
    this.type = MessageType.HandshakeMessage;
    this.content = content;
    this.handshake = handshake;
  }
}

export class ActionMessage {
  type;
  action;
  actionInput;

  /**
   * @param {{action: string, actionInput: string}} message
   */
  constructor({ action, actionInput }) {
    this.type = MessageType.ActionMessage
    this.action = action;
    this.actionInput = actionInput;
  }
}

export class BDIRespondeMessage {
  type;
  content;

  /**
   * @param {{content: string}} message
   */
  constructor({ content }) {
    this.type = MessageType.BDIRespondeMessage;
    this.content = content;
  }
}
