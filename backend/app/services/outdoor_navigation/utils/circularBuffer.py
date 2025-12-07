import numpy as np

class CircularBuffer:
    def __init__(self, capacity, noneOverridePercent=0.8):
        self.capacity = capacity
        self.queue = [None] * capacity
        self.minNumPercent = noneOverridePercent
        self.lastAccessed = False

    def add(self, term):
        # Always insert at front, drop last
        self.queue.pop()
        self.queue.insert(0, term)
        self.lastAccessed = False

    def get_last(self):
        self.lastAccessed = True
        return self.queue[0]

    def mean(self):
        temp = self.queue.copy()

        # Count None safely
        none_count = sum(1 for t in temp if t is None)

        if none_count >= self.minNumPercent * self.capacity:
            return None

        # Filter None safely
        temp = [t for t in temp if t is not None]

        # Convert to numpy array (shape: N x 3)
        arr = np.array(temp)

        # Return mean per column
        return np.mean(arr, axis=0)

    def getList(self):
        return self.queue
