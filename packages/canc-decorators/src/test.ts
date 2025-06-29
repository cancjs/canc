function replaceWithRandomFunction(value: any, context: any) {
console.log({ context }, context.access.has());
 if (context.kind === "method") {
 Object.defineProperty(context.target, context.name, {
 get() {
 return () => console.log("Random function called");
 },
 configurable: true
 });
 }
}

class Example {
 @replaceWithRandomFunction
 someMethod() {
 console.log("Original method");
 }
}

const exampleInstance = new Example();
const randomFunc = exampleInstance.someMethod; // Now acts as a getter returning a function
randomFunc(); // Logs: "Random function called"