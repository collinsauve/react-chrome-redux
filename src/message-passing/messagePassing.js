
/**
 * Definitions:
 *  MessageListener: contains an "addListener(callback)" function that will invoke the callback when a message is received
 *  MessageSender: contains a "sendMessage(message, callback)" that will send the message 
 *  StoreSubscription: contains a "wrapStore(store)" function that subscribes to changes in the store
 **/



// MessageListener implementations



/**
 * A MessageListener that uses chrome.runtime.connect ports
 **/
export class RuntimePortMessageListener
{
  constructor({portName, extensionId = ''}) {
    if (!portName) {
      throw new Error('portName is required in options');
    }
    this.portName = portName;    
    this.extensionId = extensionId; //keep the extensionId as an instance variable
    this.addListener = this.addListener.bind(this);
  }
  addListener(callback) {
    if (!this.port) {
      this.port = chrome.runtime.connect(this.extensionId, {name: this.portName});
    }
    this.port.onMessage.addListener(callback);
  }
}

/**
 * A MessageListener that uses chrome.runtime.onMessage.addListener
 */
export class RuntimeOnMessageListener {
  addListener(callback) {
      chrome.runtime.onMessage.addListener(callback);
  }
}

/**
 * A MessageListener that uses chrome.runtime.onMessageExternal.addListener
 */
export class RuntimeOnMessageExternalListener {
  addListener(callback) {
    /**
     * Setup external action handler
     */
    if (chrome.runtime.onMessageExternal) {
      chrome.runtime.onMessageExternal.addListener(callback);
    } else {
      console.warn('runtime.onMessageExternal is not supported');
    }
  }
}

/**
 * A MessageListener that combines other MessageListeners
 */
export class CombiningMessageListener {
  constructor({listeners}) {
    this.listeners = listeners;
    this.addListener = this.addListener.bind(this);
  }
  addListener(callback) {
    this.listeners.forEach(l => l.addListener(callback));
  }
}



// MessageSender implementations



/**
 * A MessageSender that uses chrome.runtime.sendMessage
 **/
export class RuntimeSendMessageSender {
  constructor({extensionId = ''}) {
    this.extensionId = extensionId;
    this.sendMessage = this.sendMessage.bind(this);
  }
  sendMessage(message, callback) {
    chrome.runtime.sendMessage(this.extensionId, message, callback);
  }
}



// StoreSubscription implementations


/**
 * currys the sender function into a function that can actually send the state
 */
const sendState = (sender) => {
    return (state) => {
      sender.postMessage({
        type: STATE_TYPE,
        payload: state
      });
    };
}

/**
 * currys the portName and store into a function that sends changes to the store to the port
 **/
const portNameFilterConnectState = (portName, store) => {
  return (port) => {
    if (port.name !== portName) {
      return;
    }

    // Send new state down connected port on every redux store state change
    const unsubscribe = store.subscribe(sendState(port.postMessage));

    // when the port disconnects, unsubscribe the sendState listener
    port.onDisconnect.addListener(unsubscribe);

    // send initial state
    sendState();
  };
};

/**
 * StoreSubscription that uses chrome.runtime.onConnect.addListener
 */
export class RuntimePortStoreSubscription {

  constructor({portName}) {
    if (!portName) {
      throw new Error('portName is required in options');
    }    
    this.portName = portName;
    this.wrapStore = this.wrapStore.bind(this);
  }

  wrapStore(store) {
    /**
     * Setup extended connection
     */
    chrome.runtime.onConnect.addListener(portNameFilterConnectState(this.portName, store));
  }
}

/**
 * StoreSubscription that uses chrome.runtime.onConnectExternal.addListener
 */
export class RuntimeExternalPortStoreSubscription {

  constructor({portName}) {
    if (!portName) {
      throw new Error('portName is required in options');
    }    
    this.portName = portName;
    this.wrapStore = this.wrapStore.bind(this);
  }

  wrapStore(store) {
    /**
     * Setup extended external connection 
     */
    if (chrome.runtime.onConnectExternal) {
      chrome.runtime.onConnectExternal.addListener(connectState);
    } else {
      console.warn('runtime.onConnectExternal is not supported');
    }
  }
}

/**
 * StoreSubscription that uses chrome.runtime.sendMessage
 */
export class RuntimeSendMessageStoreSubscription {

  constructor() {
    this.wrapStore = this.wrapStore.bind(this);
  }

  wrapStore(store) {
    store.subscribe(sendState(chrome.runtime.sendMessage));
  }
}

/**
 * StoreSubscription that combines other StoreSubscriptions
 */
export class CombiningStoreSubscription {

  constructor({subscriptions}) {
    this.subscriptions = subscriptions;
    this.wrapStore = this.wrapStore.bind(this);
  }
  wrapStore(store) {
    this.subscriptions.forEach(s => s.wrapStore(store));
  }
}
