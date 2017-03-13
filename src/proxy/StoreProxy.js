import {
  DISPATCH_TYPE,
  STATE_TYPE
} from '../constants';

class StoreProxy
{
    constructor({dispatchListener, dispatchSender, stateListener, storeSubscription}) {

        // Set dispatchListener if not already set
        // if (!dispatchListener) {
        //     dispatchListener = new 
        // }

        // When receiving a dispatch message, send it to the sender
        dispatchListener.addListener(message => {
            if (message.type === DISPATCH_TYPE) {
                dispatchSender.sendMessage(message);
            }
        });

        // Create a fake store that can be subscribed to
        let subscriptions = [];
        const store = {
            getState: () => state,
            subscribe: (callback) => {
                subscriptions.push(callback);

                // Allow unsubscribing
                return () => {
                    subscriptions = subscriptions.filter(s => s !== callback);
                }
            }
        };

        // Subcribe to that store
        storeSubscription.wrapStore(store)

        // When we receive a message to update the store, invoke all subscriptions
        stateListener.addListener(message => {
            if (message.type === STATE_TYPE) {
                subscriptions.forEach(s => s(message.payload));
            }
        });
    }
}