# How to Toggle Between Webcam and Test Video in Outdoor Navigation

The Outdoor Navigation feature allows you to switch between using your device's webcam and a test video for development and testing purposes.

## Toggle Location

To change the input source, open the file:

```
src/pages/OutdoorNavigation.jsx
```

At the top of the file, you will find the following lines:

```js
// const USE_TEST_VIDEO = false;
const USE_TEST_VIDEO = true; // Uncomment this line and comment above to use test video
```

**Instructions:**

1. **To use the webcam:**
	- Uncomment the line `// const USE_TEST_VIDEO = false;`
	- Comment out the line `const USE_TEST_VIDEO = true;`

2. **To use the test video:**
	- Uncomment the line `const USE_TEST_VIDEO = true;`
	- Comment out the line `// const USE_TEST_VIDEO = false;`

Only one of these lines should be active at a time.

---
This makes it easy to switch between live webcam input and a sample video for debugging or demonstration purposes.