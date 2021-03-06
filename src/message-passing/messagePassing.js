import {
  DISPATCH_TYPE,
  STATE_TYPE
} from '../constants';

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
 * A MessageListener that uses window.addEventListener('message', ...)
 */
export class WindowMessageListener {
  //TODO: Perhaps we should allow specifying a message origin filter?
  addListener(callback) {
    window.addEventListener('message', callback);
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

/**
 * A MessageSender that uses parent.postMessage
 **/
export class WindowPostMessageSender {
  constructor({targetWindow, targetOrigin="*"}) {
    if (!targetWindow) {
      throw new Error('targetWindow is required in options');
    }
    this.targetWindow = targetWindow;
    this.targetOrigin = targetOrigin;
    this.sendMessage = this.sendMessage.bind(this);
  }
  sendMessage(message, callback) {
    //TODO: callback isn't used.  What is the impact?
    this.targetWindow.postMessage(message);
  }
}



// StoreSubscription implementations


/**
 * currys the store and sender function into a function that builds the message to be send and calls the sender
 */
const setupSendState = (store, sender) => {
    return () => {
      sender({
        type: STATE_TYPE,
        payload: store.getState()
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
    const sendState = setupSendState(store, port.postMessage.bind(port));
    const unsubscribe = store.subscribe(sendState);

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
      chrome.runtime.onConnectExternal.addListener(portNameFilterConnectState(this.portName, store));
    } else {
      console.warn('runtime.onConnectExternal is not supported');
    }
  }
}

/**
 * StoreSubscription that uses frame.contentWindow.postMessage
 */
export class WindowPostMessageStoreSubscription {

  constructor({targetWindow, targetOrigin = "*"}) {
    if (!targetWindow) {
      throw new Error('targetWindow is required in options');
    }
    this.targetWindow = targetWindow;
    this.targetOrigin = targetOrigin;
    this.wrapStore = this.wrapStore.bind(this);
  }

  wrapStore(store) {
    const sendState = setupSendState(store, message => this.targetWindow.postMessage(message, this.targetOrigin));
    store.subscribe(sendState);
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
