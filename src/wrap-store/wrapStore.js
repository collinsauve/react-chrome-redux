import {
  DISPATCH_TYPE,
  STATE_TYPE
} from '../constants';


/**
 * Listens for DISPATCH_TYPE messages on chrome.runtime.onMessage.addListener
 */
class RuntimeOnMessageDispatchListener {
  addListener(callback) {
      chrome.runtime.onMessage.addListener(callback);
  }
}
/**
 * Listens for DISPATCH_TYPE messages on chrome.runtime.onMessageExternal.addListener
 */
class RuntimeOnMessageExternalDispatchListener {
  addListener(callback) {
    /**
     * Setup external action handler
     */
    if (chrome.runtime.onMessageExternal) {
      chrome.runtime.onMessageExternal.addListener(dispatchResponse);
    } else {
      console.warn('runtime.onMessageExternal is not supported');
    }
  }
}

class CombiningDispatchListener {
  constructor({listeners}) {
    this.listeners = listeners;
    this.addListener = this.addListener.bind(this);
  }
  addListener(callback) {
    this.listeners.forEach(l => l.addListener(callback));
  }
}







const portNameFilterConnectState = (portName, store) => {
  return (port) => {
    if (port.name !== portName) {
      return;
    }
    /**
     * Send store's current state through port
     * @return undefined
     */
    const sendState = () => {
      port.postMessage({
        type: STATE_TYPE,
        payload: store.getState()
      });
    };

    // Send new state down connected port on every redux store state change
    const unsubscribe = store.subscribe(sendState);

    // when the port disconnects, unsubscribe the sendState listener
    port.onDisconnect.addListener(unsubscribe);

    // send initial state
    sendState();
  };
};

class RuntimePortStoreSubscription {

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

class RuntimeExternalPortStoreSubscription {

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

class CombiningStoreSubscription {

  constructor({subscriptions}) {
    this.subscriptions = subscriptions;
    this.wrapStore = this.wrapStore.bind(this);
  }
  wrapStore(store) {
    this.subscriptions.forEach(s => s.wrapStore(store));
  }
}



/**
 * Responder for promisified results
 * @param  {object} dispatchResult The result from `store.dispatch()`
 * @param  {function} send         The function used to respond to original message
 * @return {undefined}
 */
const promiseResponder = (dispatchResult, send) => {
  Promise
    .resolve(dispatchResult)
    .then((res) => {
      send({
        error: null,
        value: res
      });
    })
    .catch((err) => {
      console.error('error dispatching result:', err);
      send({
        error: err.message,
        value: null
      });
    });
};

export default (store, {
  portName,
  dispatchResponder,
  dispatchListener,
  storeSubscription
}) => {

  // set dispatchListeners if not provided
  if (!dispatchListener) {
    dispatchListener = new CombiningDispatchListener({
      listeners: [
        new RuntimeOnMessageDispatchListener(), 
        new RuntimeOnMessageExternalDispatchListener()
      ]
    });
  }

  // set storeSubscription if not provided
  if (!storeSubscription) {
    storeSubscription = new CombiningStoreSubscription({
      subscriptions: [
        new RuntimePortStoreSubscription({portName}),
        new RuntimeExternalPortStoreSubscription({portName})
      ]
    });
  }

  // set dispatch responder as promise responder
  if (!dispatchResponder) {
    dispatchResponder = promiseResponder;
  }

  /**
   * Respond to dispatches from UI components
   */
  const dispatchResponse = (request, sender, sendResponse) => {
    if (request.type === DISPATCH_TYPE) {
      const action = Object.assign({}, request.payload, {
        _sender: sender
      });

      let dispatchResult = null;

      try {
        dispatchResult = store.dispatch(action);
      } catch (e) {
        dispatchResult = Promise.reject(e.message);
        console.error(e);
      }

      dispatchResponder(dispatchResult, sendResponse);
      return true;
    }
  };

  

  /**
   * Setup dispatch handler
   */
  dispatchListener.addListener(dispatchResponse);

  storeSubscription.wrapStore(store);
};
