/** @typedef Message @type { HandshakeMessage | ActionMessage | BDIRespondeMessage } */

export const MessageType = {
  HandshakeMessage: "handshake",
  ActionMessage: "action",
  BDIRespondeMessage: "bdiresponse"
}

export class HandshakeMessage {
  type;
  key;

  /**
   * @param {{key: string}} message
   */
  constructor({ key }) {
    this.type = MessageType.HandshakeMessage;
    this.key = key;
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
