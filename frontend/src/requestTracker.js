let pendingRequests = 0;
const subscribers = new Set();

const notify = () => {
  subscribers.forEach((listener) => listener(pendingRequests));
};

export const beginRequest = () => {
  pendingRequests += 1;
  notify();
};

export const endRequest = () => {
  pendingRequests = Math.max(0, pendingRequests - 1);
  notify();
};

export const subscribeToRequests = (listener) => {
  subscribers.add(listener);
  listener(pendingRequests);

  return () => {
    subscribers.delete(listener);
  };
};
