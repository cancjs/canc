describe("combinators", () => {
 it("runs both vanilla and canc entries without crashing", async () => {
 // Smoke test: both entry points should boot without errors
 const { runAllVanilla } = await import("./all-vanilla");
 const { runAllCanc } = await import("./all-canc");

 await expect(runAllVanilla()).resolves.toBeUndefined();
 await expect(runAllCanc()).resolves.toBeUndefined();
 });

 it("typechecks both vanilla and canc flavors", async () => {
 // Runtime import to verify types are exported correctly
 const vanillaAll = await import("./all-vanilla");
 const cancAll = await import("./all-canc");

 expect(typeof vanillaAll.runAllVanilla).toBe("function");
 expect(typeof cancAll.runAllCanc).toBe("function");
 });
});
