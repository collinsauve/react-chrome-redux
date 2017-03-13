import {
  DISPATCH_TYPE,
  STATE_TYPE
} from '../constants';

import {
  CombiningDispatchListener, 
  RuntimeOnMessageDispatchListener, 
  RuntimeOnMessageExternalDispatchListener, 
  CombiningStoreSubscription,
  RuntimePortStoreSubscription,
  RuntimeExternalPortStoreSubscription
} from '../message-passing/messagePassing';

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
    dispatchListener = new CombiningMessageListener({
      listeners: [
        new RuntimeOnMessageListener(), 
        new RuntimeOnMessageExternalListener()
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

  storeSubscription.wrapStore({ 
    subscribe: callback => store.subscribe(() => callback(store.getState()))
  });
};
