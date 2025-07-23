module.exports = {
 displayName: "demo-combinators",
 preset: "ts-jest",
 testEnvironment: "node",
 testMatch: ["**/*.spec.ts"],
 moduleNameMapper: {
 "^@shared/(.*)$": "<rootDir>/../_shared/$1"
 }
};
