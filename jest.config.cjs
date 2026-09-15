module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  // ts-jest requires `jest-util` the moment it loads, but declares it as an *optional* peer, so npm
  // installs nothing and every jest package keeps its own nested copy. The result is
  // "Cannot find module 'jest-util'" on a clean checkout — a green laptop only means a stale
  // node_modules. package.json therefore depends on jest-util directly; that dependency exists for
  // this transform and nothing else.
  transform: {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  coverageDirectory: "./coverage",
  testEnvironment: "node"
}
