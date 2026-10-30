// Where the TV page reads boards from. The API token is read-only: it can look up a board
// whose code you know, and nothing else (no listing, no writing).
window.TASKYARD_CONFIG = {
  container: "iCloud.app.taskyard",
  // "production" for TestFlight and App Store builds; add ?env=development to the URL for Xcode builds.
  environment: "production",
  apiToken: "00f4dbfedc34a99145a39d53604e5602bb7c044ff477a13394846c1f6f6b7638",
  refreshSeconds: 60
};
